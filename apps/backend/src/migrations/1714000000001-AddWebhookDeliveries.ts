import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddWebhookDeliveries1714000000001 implements MigrationInterface {
  name = 'AddWebhookDeliveries1714000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "webhook_deliveries_status_enum" AS ENUM ('pending', 'succeeded', 'failed')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'webhook_deliveries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'webhook_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enumName: 'webhook_deliveries_status_enum',
            default: `'pending'`,
            isNullable: false,
          },
          {
            name: 'attempt_count',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'max_attempts',
            type: 'int',
            default: 5,
            isNullable: false,
          },
          {
            name: 'next_attempt_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_attempt_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_response_status',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'last_error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_webhook_id',
        columnNames: ['webhook_id'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_next_attempt_at',
        columnNames: ['next_attempt_at'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_status_next_attempt_at',
        columnNames: ['status', 'next_attempt_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'webhook_deliveries',
      'IDX_webhook_deliveries_status_next_attempt_at',
    );
    await queryRunner.dropIndex(
      'webhook_deliveries',
      'IDX_webhook_deliveries_next_attempt_at',
    );
    await queryRunner.dropIndex(
      'webhook_deliveries',
      'IDX_webhook_deliveries_status',
    );
    await queryRunner.dropIndex(
      'webhook_deliveries',
      'IDX_webhook_deliveries_webhook_id',
    );

    await queryRunner.dropTable('webhook_deliveries', true);

    await queryRunner.query(`DROP TYPE "webhook_deliveries_status_enum"`);
  }
}