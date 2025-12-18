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
  options?: { timeout?: number; maintainRollbackOrder?: boolean },
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
      for (const rollback of rollbackFunctions) {
        await rollback();
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
