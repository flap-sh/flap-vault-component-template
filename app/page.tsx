"use client";

import Link from "next/link";
import { ArrowRight, FileText, FolderCode, Terminal } from "lucide-react";
import { useLang } from "@/src/i18n/useLang";
import type { VaultManifest } from "@/src/sdk";
import { createLocalOracleReader, VaultRuntimeProvider } from "@/src/sdk";
import { FlapNavbar } from "@/src/shell/FlapNavbar";
import { Button } from "@/src/ui/Button";
import exampleManifest from "@/src/vaults/example/manifest.json";
import exampleI18n from "@/src/vaults/example/i18n.json";

const homeManifest = exampleManifest as VaultManifest;
const homeI18n = exampleI18n as Record<string, Record<string, string>>;
const entryIcons = [FileText, FolderCode, Terminal];

export default function HomePage() {
  const { lang, languageCode } = useLang();
  const sop = lang.home.sop;
  const quickStart = sop.quickStart;
  const developerEntry = sop.developerEntry;
  const agentGuide = sop.agentGuide;

  return (
    <VaultRuntimeProvider manifest={homeManifest} i18n={homeI18n} locale={languageCode} oracleReader={createLocalOracleReader()}>
      <div className="min-h-screen bg-background">
        <FlapNavbar manifest={homeManifest} />
        <main className="px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto flex max-w-4xl flex-col gap-8">
            <section className="rounded-lg border border-primary/30 bg-primary/10 p-4 md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 lg:max-w-[20rem]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{quickStart.kicker}</p>
                  <p className="mt-2 break-words text-sm leading-6 text-white/78">{quickStart.description}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/54">{quickStart.promptLabel}</p>
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs leading-6 text-white/82">{quickStart.prompt}</pre>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{sop.label}</p>
              <h1 className="break-words text-3xl font-semibold leading-tight tracking-normal text-white md:text-5xl">{sop.title}</h1>
              <p className="max-w-3xl break-words text-base leading-7 text-white/64">{sop.description}</p>
            </section>

            <section className="rounded-lg border border-primary/25 bg-primary/10 p-4 md:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{developerEntry.kicker}</p>
                  <h2 className="mt-2 break-words text-xl font-semibold leading-tight text-white md:text-2xl">{developerEntry.title}</h2>
                  <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-white/64">{developerEntry.description}</p>
                </div>
                <div className="shrink-0 space-y-4 md:max-w-[34rem]">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{developerEntry.realExamplesLabel}</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button asChild>
                        <Link href="/community-buyback-example">
                          {developerEntry.openCommunityBuybackExample}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href="/flapixel-example">
                          {developerEntry.openFlapixelExample}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <p className="max-w-2xl text-xs leading-5 text-white/54">{developerEntry.realExamplesDescription}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/54">{developerEntry.referenceExamplesLabel}</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button asChild variant="outline">
                        <Link href="/example">
                          {developerEntry.openPreview}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href="/dex-listed-example">
                          {developerEntry.openDexListedPreview}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href="/action-gallery-example">
                          {developerEntry.openActionGalleryPreview}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <p className="max-w-2xl text-xs leading-5 text-white/54">{developerEntry.referenceExamplesDescription}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid overflow-hidden rounded-md border border-white/10 bg-black/20 lg:grid-cols-3">
                {developerEntry.cards.map((card, index) => {
                  const Icon = entryIcons[index] ?? FileText;
                  return (
                    <div key={card.title} className="border-b border-white/10 p-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-white">{card.title}</h3>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/54">{card.body}</p>
                      <ul className="mt-3 space-y-2">
                        {card.items.map((item) => (
                          <li key={item} className="break-all font-mono text-xs leading-5 text-white/78">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/54">{developerEntry.doneTitle}</p>
                <p className="mt-1 text-sm leading-6 text-white/72">{developerEntry.doneBody}</p>
              </div>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4 md:p-5">
              <h2 className="text-base font-semibold text-white">{sop.scopeTitle}</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-white/64">
                {sop.scopeItems.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4 md:p-5">
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-white">{agentGuide.title}</h2>
                <p className="break-words text-sm leading-6 text-white/64">{agentGuide.description}</p>
              </div>

              <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{agentGuide.skillTitle}</p>
                <p className="mt-2 font-mono text-sm text-white">{agentGuide.skillName}</p>
                <p className="mt-1 break-all font-mono text-xs text-white/54">{agentGuide.skillPath}</p>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-white">{agentGuide.docsTitle}</h3>
                  <div className="space-y-2">
                    {agentGuide.docs.map((doc) => (
                      <div key={doc.path} className="rounded-md border border-white/10 bg-black/25 px-3 py-3">
                        <p className="break-all font-mono text-xs text-white/82">{doc.path}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-white/54">{doc.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{agentGuide.inputsTitle}</h3>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-white/60">
                      {agentGuide.inputs.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="min-w-0 break-words">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-white">{agentGuide.outputsTitle}</h3>
                    <ul className="mt-2 grid gap-2 text-xs leading-5 text-white/58">
                      {agentGuide.outputs.map((file) => (
                        <li key={file} className="break-all rounded-md border border-white/10 bg-black/25 px-3 py-2 font-mono">
                          {file}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-white">{agentGuide.workflowTitle}</h3>
                    <ol className="mt-2 space-y-2 text-sm leading-6 text-white/60">
                      {agentGuide.workflow.map((item, index) => (
                        <li key={item} className="flex gap-3">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/10 bg-black/25 text-[10px] text-white/70">
                            {index + 1}
                          </span>
                          <span className="min-w-0 break-words">{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              {sop.steps.map((step, index) => (
                <article key={step.title} className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[4rem_1fr] md:p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-black/35 text-sm font-semibold text-white/72">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-white">{step.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-white/64">{step.body}</p>
                    {step.code ? (
                      <code className="mt-4 block overflow-x-auto rounded-md border border-white/10 bg-black/40 p-3 text-xs leading-6 text-white/82">
                        {step.code}
                      </code>
                    ) : null}
                    {step.files?.length ? (
                      <ul className="mt-4 grid gap-2 text-xs leading-5 text-white/58 sm:grid-cols-2">
                        {step.files.map((file) => (
                          <li key={file} className="break-all rounded-md border border-white/10 bg-black/25 px-3 py-2 font-mono">
                            {file}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {step.items?.length ? (
                      <ul className="mt-4 space-y-2 text-sm leading-6 text-white/60">
                        {step.items.map((item) => (
                          <li key={item} className="flex gap-3">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                            <span className="min-w-0 break-words">{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4 md:p-5">
              <h2 className="text-base font-semibold text-white">{sop.rulesTitle}</h2>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {sop.rules.map((rule) => (
                  <div key={rule} className="break-words rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm leading-6 text-white/64">
                    {rule}
                  </div>
                ))}
              </div>
            </section>

            <footer className="border-t border-white/10 pt-6">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href="/example">
                    {sop.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/dex-listed-example">
                    {sop.dexListedCta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link href="/action-gallery-example">
                    {sop.actionGalleryCta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </VaultRuntimeProvider>
  );
}
