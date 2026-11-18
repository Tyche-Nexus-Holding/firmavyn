export const maskPhoneNumber = (phoneNumber: string): string => {
  const visiblePrefixLength = Math.min(3, Math.max(1, phoneNumber.length - 3));
  const hiddenLength = Math.max(1, phoneNumber.length - visiblePrefixLength - 3);

  return `${phoneNumber.slice(0, visiblePrefixLength)}${'*'.repeat(hiddenLength)}${phoneNumber.slice(-3)}`;
};
