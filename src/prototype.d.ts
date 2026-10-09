export {};
declare global {
  interface Window {
    __MORI_NAVIGATE__?: (page: string) => void;
    __MORI_RECEIVING_FOCUS__?: string;
  }
}
