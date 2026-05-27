import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { FlapPreviewProviders } from "@/src/shell/FlapPreviewProviders";
import { DEFAULT_LANGUAGE_CODE, getLanguageCodeFromAcceptLanguage, LANGUAGE_COOKIE_KEY, normalizeLanguageCode } from "@/src/i18n/languagePreference";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flap Vault UI Template",
  description: "Build, preview, check, and package controlled Flap Vault UI components.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const languageCookie = cookies().get(LANGUAGE_COOKIE_KEY)?.value;
  const cookieLanguageCode = normalizeLanguageCode(languageCookie);
  const acceptLanguage = cookieLanguageCode ? null : headers().get("accept-language");
  const initialLanguageCode = cookieLanguageCode ?? getLanguageCodeFromAcceptLanguage(acceptLanguage);

  return (
    <html lang={initialLanguageCode} className="dark">
      <body>
        <FlapPreviewProviders hasInitialLanguageCookie={Boolean(cookieLanguageCode)} initialLanguageCode={initialLanguageCode}>
          {children}
        </FlapPreviewProviders>
      </body>
    </html>
  );
}
