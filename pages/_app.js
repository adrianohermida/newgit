
import '../styles/globals.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { ToastProvider } from '../components/ui/toast';
import { InternalThemeProvider } from '../components/interno/InternalThemeProvider';
import useConsoleRouteInstrumentation from '../hooks/useConsoleRouteInstrumentation';

const FreshchatWebMessenger = dynamic(() => import('../components/FreshchatWebMessenger'), { ssr: false });
const CHUNK_RECOVERY_MARKER = 'hmadv_chunk_recovery_once_v1';
const LEGACY_PORTAL_SW_MARKER = 'hmadv_legacy_portal_sw_cleanup_v1';

function shouldRecoverFromChunkError(reason = '') {
  const message = String(reason || '').toLowerCase();
  return (
    message.includes('chunkloaderror') ||
    message.includes('loading chunk') ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('/_next/static/') ||
    message.includes('strict mime type checking') ||
    message.includes('is not executable')
  );
}

async function clearFrontendRuntimeCaches() {
  if (typeof window === 'undefined') return;
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) =>
          key.startsWith('hmadv-static-') ||
          key.startsWith('hmadv-dynamic-') ||
          key.startsWith('hmadv-data-') ||
          key.startsWith('hmadv-portal-') ||
          key.startsWith('workbox') ||
          key.startsWith('next-') ||
          key.includes('_next') ||
          key.includes('turbopack') ||
          key.includes('precache')
        )
        .map((key) => caches.delete(key).catch(() => null))
    );
  } catch {
    // noop
  }
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isInternalRoute = String(router.pathname || '').startsWith('/interno');
  useConsoleRouteInstrumentation(router);

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
      const setmoreScript = document.getElementById('setmore_script');
      const setmoreButton = document.getElementById('Setmore_button_iframe');

      if (!isInternalRoute) {
        if (!setmoreScript) {
          const script = document.createElement('script');
          script.id = 'setmore_script';
          script.type = 'text/javascript';
          script.src = 'https://storage.googleapis.com/fullintegration-live/webComponentAppListing/Container/setmoreIframeLive.js';
          document.body.appendChild(script);
        }
        if (!setmoreButton) {
          const a = document.createElement('a');
          a.id = 'Setmore_button_iframe';
          a.href = 'https://booking.setmore.com/scheduleappointment/93965fbc-3be5-4b72-aa5b-3b2e2b67d46b';
          a.style.cssText = 'float:none; position: fixed; right: -2px; top: 25%; display: block; z-index: 20000';
          a.innerHTML = '<img border="none" src="https://fm.sendpul.se/8672e56ee69550b039f6b32e73b058d56692731/Site/booking.svg" alt="Book an appointment with Hermida Maia Advocacia using Setmore"/>';
          document.body.appendChild(a);
        }
      } else {
        setmoreScript?.remove();
        setmoreButton?.remove();
      }

      const legacyTrackingScript = document.getElementById('freshsales_crm_script');
      if (legacyTrackingScript) {
        legacyTrackingScript.remove();
      }
    }
  }, [isInternalRoute]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }

    const registerWorker = async () => {
      try {
        if (window.sessionStorage.getItem(LEGACY_PORTAL_SW_MARKER) !== '1') {
          const registrations = await navigator.serviceWorker.getRegistrations();
          const legacyRegistrations = registrations.filter((registration) =>
            registration?.active?.scriptURL?.endsWith('/portal-sw.js') ||
            registration?.waiting?.scriptURL?.endsWith('/portal-sw.js') ||
            registration?.installing?.scriptURL?.endsWith('/portal-sw.js')
          );

          await Promise.all(legacyRegistrations.map((registration) => registration.unregister().catch(() => null)));
          window.sessionStorage.setItem(LEGACY_PORTAL_SW_MARKER, '1');
        }
      } catch {
        // noop
      }

      navigator.serviceWorker.register('/service-worker.js').catch(() => null);
    };

    if (document.readyState === 'complete') {
      registerWorker();
      return undefined;
    }

    window.addEventListener('load', registerWorker, { once: true });
    return () => window.removeEventListener('load', registerWorker);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const recoverFrontend = async (reason) => {
      try {
        if (!shouldRecoverFromChunkError(reason)) return;
        if (window.sessionStorage.getItem(CHUNK_RECOVERY_MARKER) === '1') return;
        window.sessionStorage.setItem(CHUNK_RECOVERY_MARKER, '1');
        await clearFrontendRuntimeCaches();
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('__hmadv_reload', String(Date.now()));
        window.location.replace(nextUrl.toString());
      } catch {
        // noop
      }
    };

    const handleWindowError = (event) => {
      const targetSource =
        event?.target?.src ||
        event?.filename ||
        event?.message ||
        '';
      recoverFrontend(targetSource);
    };

    const handleUnhandledRejection = (event) => {
      const reason =
        event?.reason?.message ||
        event?.reason?.stack ||
        event?.reason ||
        '';
      recoverFrontend(reason);
    };

    window.addEventListener('error', handleWindowError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <>
      <Head>
        <title>Hermida Maia Advocacia | Advogado Especialista em Superendividamento, Juros Abusivos e Contratos Bancários</title>
        <meta name="description" content="Escritório de advocacia especializado em superendividamento, revisão bancária, contratos, defesa contra juros abusivos, empréstimo consignado, cartão de crédito e direito bancário." />
        <meta name="keywords" content="advogado, superendividamento, revisão bancária, contratos, juros abusivo, empréstimo consignado, cartão de crédito, reserva de margem consignada, defesa do consumidor, negociação de dívidas, recuperação judicial, direito bancário, consultoria jurídica" />
        <link rel="icon" type="image/webp" href="/images/OIP.webp" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#07110E" />
        <meta name="application-name" content="Hermida Maia" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Hermida Maia" />
        <meta name="mobile-web-app-capable" content="yes" />
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
        {/* Material Icons CDN */}
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </Head>
      {!isInternalRoute ? <FreshchatWebMessenger /> : null}
      <InternalThemeProvider>
        <ToastProvider>
          <Component {...pageProps} />
        </ToastProvider>
      </InternalThemeProvider>
    </>
  );
}
