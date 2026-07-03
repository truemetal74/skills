interface EnvConfig {
  VITE_API_URL?: string;
  VITE_DEBUG?: string;
  VITE_RECAPTCHA_SITE_KEY?: string;
}

declare global {
  interface Window {
    ENV_CONFIG?: EnvConfig;
  }
}

class ConfigService {
  private config: EnvConfig;

  constructor() {
    this.config = window.ENV_CONFIG || {
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_DEBUG: import.meta.env.VITE_DEBUG,
      VITE_RECAPTCHA_SITE_KEY: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
    };

    if (window.ENV_CONFIG) {
      console.log("[Config] Using runtime configuration");
    }
  }

  get apiUrl(): string {
    return this.config.VITE_API_URL || "http://localhost:8083";
  }

  get debug(): boolean {
    return this.config.VITE_DEBUG === "true";
  }

  get recaptchaSiteKey(): string {
    return this.config.VITE_RECAPTCHA_SITE_KEY || "";
  }

  get recaptchaEnabled(): boolean {
    return !!this.config.VITE_RECAPTCHA_SITE_KEY;
  }
}

export const config = new ConfigService();
