export const SMS_BASIC_INCLUDED_CONTRACTS = 5;
export const SMS_EXTRA_PRICE_CENTS = 15;

export type SmsVerificationPlan = 'free' | 'basic';

export const getSmsVerificationPlan = (isSmsVerificationEnabled: boolean | undefined): SmsVerificationPlan => {
  // TODO(firmavyn-plans): Replace this claim flag with the future plan model.
  return isSmsVerificationEnabled === true ? 'basic' : 'free';
};

export const getSmsUsagePeriod = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
};

export const isExtraSmsContract = (existingContractCount: number): boolean => {
  return existingContractCount >= SMS_BASIC_INCLUDED_CONTRACTS;
};
