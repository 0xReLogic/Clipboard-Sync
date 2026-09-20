export async function copyTextToClipboard(plaintext: string): Promise<boolean> {
  // Method 1: Modern Navigator Clipboard API
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(plaintext);
      return true;
    }
  } catch {
    // Proceed to synchronous fallback
  }

  // Method 2: Synchronous DOM fallback for mobile Safari / WebView restrictions
  try {
    const textarea = document.createElement('textarea');
    textarea.value = plaintext;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export async function copyImageToClipboard(base64Data: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext && typeof ClipboardItem !== 'undefined') {
      const byteCharacters = atob(base64Data.split(',')[1] || base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      return true;
    }
  } catch {
    // Fallback if image writing is unsupported on device
  }
  return false;
}
