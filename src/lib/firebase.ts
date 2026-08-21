import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

declare global {
  interface Window {
    UORQUI_FIREBASE_CONFIG?: FirebaseOptions;
  }
}

const config = window.UORQUI_FIREBASE_CONFIG;
if (!config?.apiKey || String(config.apiKey).includes("COLE_AQUI") || !config?.appId || String(config.appId).includes("COLE_AQUI")) {
  throw new Error("Firebase Web App ainda não foi configurado em public/firebase-config.js.");
}

const normalizedConfig: FirebaseOptions = { ...config };
if (!normalizedConfig.messagingSenderId && normalizedConfig.appId) {
  const parts = String(normalizedConfig.appId).split(":");
  if (parts.length > 1 && /^\d+$/.test(parts[1])) normalizedConfig.messagingSenderId = parts[1];
}

export const firebaseApp = initializeApp(normalizedConfig);
export const auth = getAuth(firebaseApp);
