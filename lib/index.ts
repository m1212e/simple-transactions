type MaybePromise<T> = T | Promise<T>;
type RollbackFunction = () => MaybePromise<void>;
type FinalizerFunction = (success: boolean) => MaybePromise<void>;

function createTX(
  rollbackFunctions: Array<RollbackFunction>,
  finalizerFunctions: Array<FinalizerFunction>,
) {
  const tx = <T, P extends MaybePromise<T>>({
    fn,
    rollback,
    finalizer,
  }: {
    /**
     * A function to execute within the transaction.
     */
    fn: () => P;
    /**
     * A function to execute if an error occurs during the transaction.
     * Should rollback the paired fn call and undo any changes made by the fn call.
     */
    rollback: RollbackFunction;
    /**
     * A function to execute after the transaction completes, regardless of success or failure.
     * Errors inside this function will not influence transaction execution or rollback in any way.
     * Errors inside will be logged but not propagated.
     * Execution happens in parallel after the transaction completes.
     * Receives a boolean indicating whether the transaction succeeded. True if the transaction succeeded, false if it failed.
     */
    finalizer?: FinalizerFunction;
  }): P => {
    if (finalizer) {
      finalizerFunctions.push(finalizer);
    }

    const result = fn();

    if (result instanceof Promise) {
      return result.then((value) => {
        rollbackFunctions.push(rollback);
        return value;
      }) as P;
    } else {
      rollbackFunctions.push(rollback);
      return result;
    }
  };

  tx.onFinalize = (finalizer: FinalizerFunction) => {
    finalizerFunctions.push(finalizer);
    return tx;
  };

  return tx as typeof tx & {
    onFinalize: (finalizer: FinalizerFunction) => typeof tx;
  };
}

/**
 * Create a transaction that executes the provided functions and rolls back if an error occurs during execution.
 */
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
  const finalizerFunctions: Array<FinalizerFunction> = [];
  const tx = createTX(rollbackFunctions, finalizerFunctions);

  let success = true;
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
              new Error(`Transaction timed out after ${options.timeout}ms`),
            ),
          options.timeout,
        ),
      ),
    ]);
  } catch (error) {
    success = false;
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
      await Promise.all(
        rollbackFunctions.map(async (rollback) => {
          if (options.abortRollbackReporter) {
            try {
              await rollback();
            } catch (error) {
              options.abortRollbackReporter(error as Error);
            }
          } else {
            rollback();
          }
        }),
      );
    }

    throw error;
  } finally {
    await Promise.allSettled(
      finalizerFunctions.map(async (finalizer) => {
        try {
          await finalizer(success);
        } catch (error) {
          console.error("Finalizer error:", error);
        }
      }),
    );
  }
}
