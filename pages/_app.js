import '../styles/globals.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

const FreshchatWebMessenger = dynamic(() => import('../components/FreshchatWebMessenger'), { ssr: false });

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isPortalRoute = String(router.pathname || '').startsWith('/portal');

  // Google Tag Manager noscript e Setmore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // GTM noscript (GTM-TMBHHW6)
      if (!document.getElementById('gtm-body')) {
        const noscript = document.createElement('noscript');
        noscript.id = 'gtm-body';
        noscript.innerHTML = `<iframe src=\"https://www.googletagmanager.com/ns.html?id=GTM-TMBHHW6\" height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe>`;
        document.body.prepend(noscript);
      }
      // Setmore
      if (!document.getElementById('setmore_script')) {
        const script = document.createElement('script');
        script.id = 'setmore_script';
        script.type = 'text/javascript';
        script.src = 'https://storage.googleapis.com/fullintegration-live/webComponentAppListing/Container/setmoreIframeLive.js';
        document.body.appendChild(script);
      }
      if (!document.getElementById('Setmore_button_iframe')) {
        const a = document.createElement('a');
        a.id = 'Setmore_button_iframe';
        a.href = 'https://booking.setmore.com/scheduleappointment/93965fbc-3be5-4b72-aa5b-3b2e2b67d46b';
        a.style.cssText = 'float:none; position: fixed; right: -2px; top: 25%; display: block; z-index: 20000';
        a.innerHTML = '<img border="none" src="https://fm.sendpul.se/8672e56ee69550b039f6b32e73b058d56692731/Site/booking.svg" alt="Book an appointment with Hermida Maia Advocacia using Setmore"/>';
        document.body.appendChild(a);
      }

      const legacyTrackingScript = document.getElementById('freshsales_crm_script');
      if (legacyTrackingScript) {
        legacyTrackingScript.remove();
      }
    }
  }, [isPortalRoute]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }

    const registerWorker = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    };

    if (document.readyState === 'complete') {
      registerWorker();
      return undefined;
    }

    window.addEventListener('load', registerWorker, { once: true });
    return () => window.removeEventListener('load', registerWorker);
  }, []);

  return (
    <>
      <Head>
        <title>Hermida Maia Advocacia | Advogado Especialista em Superendividamento, Juros Abusivos e Contratos Bancários</title>
        <meta name="description" content="Escritório de advocacia especializado em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado, cartão de crédito e direito bancário." />
        <meta name="keywords" content="advogado, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, reserva de margem consignada, defesa do consumidor, negociação de dívidas, recuperação judicial, direito bancário, consultoria jurídica" />
        <link rel="icon" type="image/webp" href="/images/OIP.webp" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#07110E" />
        {/* Google Tag Manager Head (GTM-TMBHHW6 e GTM-56WQHDR) */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-TMBHHW6');
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-56WQHDR');
        `}} />
        {/* Google Analytics Universal */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=UA-72669401-1"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'UA-72669401-1');
        `}} />
        {/* Google Analytics 4 */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-72669401"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-72669401');
        `}} />
      </Head>
      <FreshchatWebMessenger />
      <Component {...pageProps} />
    </>
  );
}
