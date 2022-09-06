declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: number;
      GOOGLE_CLIENT_MAIL: string;
      GOOGLE_SOURCE_CALENDAR_ID: string;
      GOOGLE_TARGET_CALENDAR_ID: string;
    }
  }
}
  
export {}