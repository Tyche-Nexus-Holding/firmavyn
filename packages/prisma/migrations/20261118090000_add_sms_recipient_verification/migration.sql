-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN "phone" VARCHAR(16);

-- CreateTable
CREATE TABLE "SmsVerificationOtp" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "SmsVerificationOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsVerificationMonthlyUsage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "smsCount" INTEGER NOT NULL DEFAULT 0,
    "contractCount" INTEGER NOT NULL DEFAULT 0,
    "extraSmsCount" INTEGER NOT NULL DEFAULT 0,
    "extraAmountCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SmsVerificationMonthlyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsVerificationContractUsage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teamId" INTEGER NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "isExtra" BOOLEAN NOT NULL,

    CONSTRAINT "SmsVerificationContractUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsVerificationOtp_recipientId_key" ON "SmsVerificationOtp"("recipientId");
CREATE INDEX "SmsVerificationOtp_expiresAt_idx" ON "SmsVerificationOtp"("expiresAt");
CREATE UNIQUE INDEX "SmsVerificationMonthlyUsage_teamId_period_key" ON "SmsVerificationMonthlyUsage"("teamId", "period");
CREATE INDEX "SmsVerificationMonthlyUsage_teamId_idx" ON "SmsVerificationMonthlyUsage"("teamId");
CREATE UNIQUE INDEX "SmsVerificationContractUsage_teamId_envelopeId_period_key" ON "SmsVerificationContractUsage"("teamId", "envelopeId", "period");
CREATE INDEX "SmsVerificationContractUsage_teamId_period_idx" ON "SmsVerificationContractUsage"("teamId", "period");
CREATE INDEX "SmsVerificationContractUsage_envelopeId_idx" ON "SmsVerificationContractUsage"("envelopeId");

-- AddForeignKey
ALTER TABLE "SmsVerificationOtp" ADD CONSTRAINT "SmsVerificationOtp_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsVerificationMonthlyUsage" ADD CONSTRAINT "SmsVerificationMonthlyUsage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsVerificationContractUsage" ADD CONSTRAINT "SmsVerificationContractUsage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsVerificationContractUsage" ADD CONSTRAINT "SmsVerificationContractUsage_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
