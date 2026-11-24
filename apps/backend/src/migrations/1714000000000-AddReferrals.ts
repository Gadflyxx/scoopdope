import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferrals1714000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "referralCode" varchar UNIQUE`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "referredBy" varchar`);

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referrerId" uuid NOT NULL,
        "referredUserId" uuid NOT NULL,
        "code" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "rewardPaidAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_referrals_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_referrals_referredUserId" UNIQUE ("referredUserId"),
        CONSTRAINT "UQ_referrals_code" UNIQUE ("code"),
        CONSTRAINT "FK_referrals_referrerId" FOREIGN KEY ("referrerId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_referrals_referredUserId" FOREIGN KEY ("referredUserId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_referrals_referrerId" ON "referrals" ("referrerId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_referrals_referrerId"`);
    await queryRunner.query(`DROP TABLE "referrals"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referredBy"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referralCode"`);
  }
}