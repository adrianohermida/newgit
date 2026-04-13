import { Head, Html, Main, NextScript } from "next/document";
import { buildInternalThemeBootScript } from "../lib/interno/theme";

export default function Document() {
  return (
    <Html lang="pt-BR" suppressHydrationWarning>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: buildInternalThemeBootScript() }} />
      </Head>
      <body suppressHydrationWarning>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
