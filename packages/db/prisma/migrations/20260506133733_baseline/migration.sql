-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'running', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "GridPointStatus" AS ENUM ('pending', 'running', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "BusinessState" AS ENUM ('ranked', 'beyond_20', 'not_found');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "googlePlaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formattedAddress" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "googleBusinessType" TEXT,
    "googleEditorialSummary" TEXT,
    "suggestedKeywords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedBusiness" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "trackedBusinessId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "center" geography(Point, 4326),
    "radiusMeters" INTEGER NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 5,
    "status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "batchId" TEXT,
    "batchOrdinal" INTEGER,
    "shareToken" TEXT NOT NULL,
    "notificationEmail" TEXT,
    "notificationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GridPoint" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "status" "GridPointStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GridPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL,
    "gridPointId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "businessState" "BusinessState" NOT NULL,
    "businessRank" INTEGER,
    "competitors" JSONB NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLedger" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "gridPointId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerFirstName" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "googleReviewUrl" TEXT,
    "googleBusinessType" TEXT,
    "googleEditorialSummary" TEXT,
    "ownerDescription" TEXT,
    "aiPromptOverride" TEXT,
    "smsTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "deliveryChannel" TEXT NOT NULL DEFAULT 'sms',
    "clientPhoneE164" TEXT,
    "clientPhoneHash" TEXT,
    "clientEmail" TEXT,
    "clientEmailHash" TEXT,
    "scheduledSendAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "ratedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "reviewText" TEXT,
    "aiSuggestedReview" TEXT,
    "routedTo" TEXT,
    "googleClickedAt" TIMESTAMP(3),
    "feedbackSubmittedAt" TIMESTAMP(3),
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "smsSid" TEXT,
    "smsDeliveredAt" TIMESTAMP(3),
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Place_googlePlaceId_key" ON "Place"("googlePlaceId");

-- CreateIndex
CREATE INDEX "Place_createdAt_idx" ON "Place"("createdAt");

-- CreateIndex
CREATE INDEX "TrackedBusiness_userId_idx" ON "TrackedBusiness"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedBusiness_userId_placeId_key" ON "TrackedBusiness"("userId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Scan_shareToken_key" ON "Scan"("shareToken");

-- CreateIndex
CREATE INDEX "Scan_trackedBusinessId_createdAt_idx" ON "Scan"("trackedBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_status_idx" ON "Scan"("status");

-- CreateIndex
CREATE INDEX "Scan_batchId_idx" ON "Scan"("batchId");

-- CreateIndex
CREATE INDEX "GridPoint_scanId_status_idx" ON "GridPoint"("scanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GridPoint_scanId_idx_key" ON "GridPoint"("scanId", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "ScanResult_gridPointId_key" ON "ScanResult"("gridPointId");

-- CreateIndex
CREATE INDEX "ScanResult_cacheKey_idx" ON "ScanResult"("cacheKey");

-- CreateIndex
CREATE INDEX "ScanResult_fetchedAt_idx" ON "ScanResult"("fetchedAt");

-- CreateIndex
CREATE INDEX "UsageLedger_scanId_idx" ON "UsageLedger"("scanId");

-- CreateIndex
CREATE INDEX "UsageLedger_createdAt_idx" ON "UsageLedger"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Business_ownerEmail_key" ON "Business"("ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_token_key" ON "ReviewRequest"("token");

-- CreateIndex
CREATE INDEX "ReviewRequest_clientPhoneHash_idx" ON "ReviewRequest"("clientPhoneHash");

-- CreateIndex
CREATE INDEX "ReviewRequest_clientEmailHash_idx" ON "ReviewRequest"("clientEmailHash");

-- CreateIndex
CREATE INDEX "ReviewRequest_scheduledSendAt_sentAt_idx" ON "ReviewRequest"("scheduledSendAt", "sentAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_businessId_createdAt_idx" ON "ReviewRequest"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedBusiness" ADD CONSTRAINT "TrackedBusiness_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedBusiness" ADD CONSTRAINT "TrackedBusiness_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_trackedBusinessId_fkey" FOREIGN KEY ("trackedBusinessId") REFERENCES "TrackedBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GridPoint" ADD CONSTRAINT "GridPoint_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_gridPointId_fkey" FOREIGN KEY ("gridPointId") REFERENCES "GridPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
