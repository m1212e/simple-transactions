type MaybePromise<T> = T | Promise<T>;
type RollbackFunction = () => MaybePromise<void>;

function createTX(rollbackFunctions: Array<RollbackFunction>) {
  return <T, P extends MaybePromise<T>>({
    fn,
    rollback,
  }: {
    fn: () => P;
    rollback: RollbackFunction;
  }) => {
    rollbackFunctions.push(rollback);
    return fn();
  };
}

export async function transaction<T, P extends MaybePromise<T>>(
  content: (transaction: ReturnType<typeof createTX>) => P,
  options?: {
    /**
     * Timeout in milliseconds for the transaction.
     * Throws an error if the transaction times out.
     * Rollbacks will be executed in case of timeout.
     * Disabled by default.
     */
    timeout?: number;
    /**
     * Maintain the order of rollback functions.
     * If true, rollbacks will be executed in reverse order.
     * If false, rollbacks will be executed in parallel.
     * true by default.
     */
    maintainRollbackOrder?: boolean;
    /**
     * Abort the rollback process if an error occurs.
     * If true, the rollback process will be aborted immediately if an error occurs and throw the error (instead of the transaction error).
     * If false, the rollback process will continue even if an error occurs and log the error to console.
     * Enabled by default.
     */
    abortRollback?: boolean;
    /**
     * Will be called with all errors that occur during the rollback process.
     */
    abortRollbackReporter?: (error: Error) => void;
  },
): Promise<P> {
  const rollbackFunctions: Array<RollbackFunction> = [];
  const tx = createTX(rollbackFunctions);

  try {
    if (options?.timeout === undefined) {
      return await content(tx);
    }

    return await Promise.race([
      content(tx),
      new Promise<Awaited<ReturnType<typeof content>>>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Transaction timed out after " + options.timeout + "ms",
              ),
            ),
          options.timeout,
        ),
      ),
    ]);
  } catch (error) {
    if (
      options?.maintainRollbackOrder === undefined ||
      options.maintainRollbackOrder
    ) {
      for (const rollback of rollbackFunctions.reverse()) {
        try {
          await rollback();
        } catch (rollbackError) {
          if (options?.abortRollback === undefined || options.abortRollback) {
            options?.abortRollbackReporter?.(rollbackError as Error);
            throw rollbackError;
          }

          if (options?.abortRollbackReporter) {
            options.abortRollbackReporter(rollbackError as Error);
          } else {
            console.error("Rollback error:", rollbackError);
          }
        }
      }
    } else {
      const rollbacks = rollbackFunctions.map((rollback) => rollback());
      for (const rollback of rollbacks) {
        await rollback;
      }
    }

    throw error;
  }
}
