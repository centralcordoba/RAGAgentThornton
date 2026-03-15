// ============================================================================
// FILE: apps/api/src/graph/neo4jClient.ts
// Neo4j driver wrapper with connection management and schema initialization.
// ============================================================================

import neo4j, { type Driver, type Session, type ManagedTransaction } from 'neo4j-driver';
import { createServiceLogger } from '../config/logger.js';
import { SCHEMA_CONSTRAINTS, SCHEMA_INDEXES } from './schema.js';

const logger = createServiceLogger('graph:neo4j');

export class Neo4jClient {
  private readonly driver: Driver;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10_000,
      logging: {
        level: 'warn',
        logger: (level, message) => logger.warn({ operation: 'neo4j:driver', level, message }),
      },
    });
  }

  /** Verify connectivity and initialize schema. */
  async initialize(): Promise<void> {
    const startTime = Date.now();

    await this.driver.verifyConnectivity();

    const session = this.driver.session();
    try {
      for (const constraint of SCHEMA_CONSTRAINTS) {
        await session.run(constraint);
      }
      for (const index of SCHEMA_INDEXES) {
        await session.run(index);
      }

      logger.info({
        operation: 'neo4j:initialize',
        constraints: SCHEMA_CONSTRAINTS.length,
        indexes: SCHEMA_INDEXES.length,
        duration: Date.now() - startTime,
        result: 'success',
      });
    } finally {
      await session.close();
    }
  }

  /** Get a session for manual transaction management. */
  getSession(database?: string): Session {
    return this.driver.session({ database: database ?? 'neo4j' });
  }

  /** Execute a read transaction. */
  async readTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
  ): Promise<T> {
    const session = this.getSession();
    try {
      return await session.executeRead(work);
    } finally {
      await session.close();
    }
  }

  /** Execute a write transaction. */
  async writeTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>,
  ): Promise<T> {
    const session = this.getSession();
    try {
      return await session.executeWrite(work);
    } finally {
      await session.close();
    }
  }

  /** Health check — verify connectivity. */
  async ping(): Promise<boolean> {
    try {
      const info = await this.driver.getServerInfo();
      return !!info;
    } catch {
      return false;
    }
  }

  /** Close the driver. */
  async close(): Promise<void> {
    await this.driver.close();
    logger.info({ operation: 'neo4j:close', result: 'success' });
  }
}
