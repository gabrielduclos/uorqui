export {};

const MOBILE_LOGIN_LOGO = "/assets/uorqui-wordmark.png";

function syncMobileLoginLogo() {
  document.querySelectorAll<HTMLImageElement>(".auth-mobile-logo").forEach((image) => {
    if (image.getAttribute("src") !== MOBILE_LOGIN_LOGO) {
      image.setAttribute("src", MOBILE_LOGIN_LOGO);
    }
    image.decoding = "async";
  });
}

const loginLogoObserver = new MutationObserver(syncMobileLoginLogo);
loginLogoObserver.observe(document.documentElement, { childList: true, subtree: true });
syncMobileLoginLogo();
