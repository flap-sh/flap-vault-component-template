import { useFlapSdk } from "./runtime";

export function useFlapWallet() {
  return useFlapSdk().wallet;
}
