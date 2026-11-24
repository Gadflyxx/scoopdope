import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnrolledVersionNumber1748400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "enrolledVersionNumber" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "enrolledVersionNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lessons" DROP COLUMN IF EXISTS "version"`,
    );
    await queryRunner.query(
      `ALTER TABLE "courses" DROP COLUMN IF EXISTS "version"`,
    );
  }
}