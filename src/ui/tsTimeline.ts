const PACKET_SIZE = 188;
const CLOCK_WRAP = 2 ** 33;
const wrapClock = (value: number) => ((value % CLOCK_WRAP) + CLOCK_WRAP) % CLOCK_WRAP;

function readTimestamp(bytes: Uint8Array, offset: number) {
  return (bytes[offset] & 14) * 2 ** 29 + bytes[offset + 1] * 2 ** 22 +
    (bytes[offset + 2] & 254) * 2 ** 14 + bytes[offset + 3] * 128 + (bytes[offset + 4] >> 1);
}
function writeTimestamp(bytes: Uint8Array, offset: number, value: number) {
  const clock = wrapClock(value);
  bytes[offset] = (bytes[offset] & 241) | (Math.floor(clock / 2 ** 29) & 14);
  bytes[offset + 1] = Math.floor(clock / 2 ** 22) & 255;
  bytes[offset + 2] = (Math.floor(clock / 2 ** 14) & 254) | 1;
  bytes[offset + 3] = Math.floor(clock / 128) & 255;
  bytes[offset + 4] = ((clock % 128) << 1) | 1;
}

/** Rebase PES/PCR clocks only; encoded audio/video bytes are never transcoded.
 * Clips can restart their transport clock even though provider metadata is continuous.
 * Keep packet fragments and split PES headers until all timestamp bytes are available.
 */
export class TsTimeline {
  private pending = new Uint8Array(0);
  private shift: number | null = null;
  private held: Uint8Array[] = [];
  private headers = new Map<number, { bytes: { packet: Uint8Array; offset: number }[]; length: number }>();
  constructor(private readonly startMs: number) {}

  push(chunk: Uint8Array, final = false): Uint8Array {
    const combined = new Uint8Array(this.pending.length + chunk.length);
    combined.set(this.pending); combined.set(chunk, this.pending.length);
    const complete = combined.length - combined.length % PACKET_SIZE;
    for (let offset = 0; offset < complete; offset += PACKET_SIZE) {
      const packet = combined.slice(offset, offset + PACKET_SIZE);
      if (packet[0] !== 0x47 || packet[1] & 0x80 || packet[3] & 0xc0) throw new Error("Invalid MPEG-TS packet");
      this.held.push(packet);
      const pid = ((packet[1] & 31) << 8) | packet[2];
      const control = (packet[3] >> 4) & 3;
      let payload = 4;
      if (control & 2) { payload += 1 + packet[4]; if (payload > PACKET_SIZE) throw new Error("Invalid adaptation field"); }
      if (!(control & 1) || payload === PACKET_SIZE) continue;
      if (packet[1] & 0x40) {
        if (this.headers.has(pid)) throw new Error("Incomplete PES header");
        this.headers.set(pid, { bytes: [], length: 6 });
      }
      const header = this.headers.get(pid);
      if (!header) continue;
      for (let index = payload; index < PACKET_SIZE && header.bytes.length < header.length; index++) {
        header.bytes.push({ packet, offset: index });
        if (header.bytes.length === 6) {
          const bytes = Uint8Array.from(header.bytes, ({ packet, offset }) => packet[offset]);
          const stream = bytes[3];
          if (bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 ||
              (!(stream >= 0xc0 && stream <= 0xef) && stream !== 0xbd)) { this.headers.delete(pid); break; }
          header.length = 9;
        }
        if (header.bytes.length === 9) {
          const flags = header.bytes[7].packet[header.bytes[7].offset] >> 6;
          header.length = flags === 3 ? 19 : flags === 2 ? 14 : 9;
          if (header.bytes[8].packet[header.bytes[8].offset] < header.length - 9) throw new Error("Invalid PES timestamp header");
        }
      }
      if (this.headers.has(pid) && header.bytes.length === header.length) {
        if (header.length > 9) {
          const bytes = Uint8Array.from(header.bytes, ({ packet, offset }) => packet[offset]);
          if (this.shift === null) this.shift = this.startMs * 90 - readTimestamp(bytes, header.length === 19 ? 14 : 9);
          writeTimestamp(bytes, 9, readTimestamp(bytes, 9) + this.shift);
          if (header.length === 19) writeTimestamp(bytes, 14, readTimestamp(bytes, 14) + this.shift);
          header.bytes.forEach(({ packet, offset }, index) => { packet[offset] = bytes[index]; });
        }
        this.headers.delete(pid);
      }
    }
    this.pending = combined.slice(complete);
    if (this.held.length > 4096 && (this.shift === null || this.headers.size)) throw new Error("Missing MPEG-TS timestamps");
    if (final && (this.pending.length || this.headers.size || this.shift === null)) throw new Error("Incomplete MPEG-TS clip");
    if (this.shift === null || this.headers.size) return new Uint8Array(0);
    const output = new Uint8Array(this.held.length * PACKET_SIZE);
    this.held.forEach((packet, index) => {
      if (packet[3] & 0x20 && packet[4] >= 7 && packet[5] & 0x10) {
        const base = packet[6] * 2 ** 25 + packet[7] * 2 ** 17 + packet[8] * 512 + packet[9] * 2 + (packet[10] >> 7);
        const clock = wrapClock(base + this.shift!);
        packet[6] = Math.floor(clock / 2 ** 25) & 255; packet[7] = Math.floor(clock / 2 ** 17) & 255;
        packet[8] = Math.floor(clock / 512) & 255; packet[9] = Math.floor(clock / 2) & 255;
        packet[10] = (packet[10] & 127) | ((clock % 2) << 7);
      }
      output.set(packet, index * PACKET_SIZE);
    });
    this.held = [];
    return output;
  }
}
