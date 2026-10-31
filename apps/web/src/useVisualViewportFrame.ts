import { useEffect } from 'react';

/**
 * Keep the application inside the *visible* viewport instead of allowing mobile
 * Safari/Chrome to pan the conversation headers when the soft keyboard opens.
 * Only the message list shrinks; the composer remains above the keyboard.
 */
export function useVisualViewportFrame() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let animationFrame = 0;

    function sync() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const top = viewport ? Math.max(0, viewport.offsetTop) : 0;
        const height = viewport ? viewport.height : window.innerHeight;
        root.style.setProperty('--uorqui-app-top', top + 'px');
        root.style.setProperty('--uorqui-app-height', Math.max(1, height) + 'px');
      });
    }

    document.body.classList.add('uorqui-app-active');
    sync();
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      root.style.removeProperty('--uorqui-app-top');
      root.style.removeProperty('--uorqui-app-height');
      document.body.classList.remove('uorqui-app-active');
    };
  }, []);
}
