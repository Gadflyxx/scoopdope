import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstructorApplicationLocale1761000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instructor_applications" ADD COLUMN IF NOT EXISTS "locale" character varying NOT NULL DEFAULT 'en'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "instructor_applications" DROP COLUMN IF EXISTS "locale"`,
    );
  }
}