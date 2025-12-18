import { describe, expect, it, mock } from "bun:test";
import { transaction } from "../lib";

describe("test transaction", async () => {
  it("should create a transaction instance", async () => {
    await transaction((tx) => {
      expect(tx).toBeDefined();
    });
  });

  it("should return object", async () => {
    const dummy = { a: "b" };
    const ret = await transaction((tx) => {
      return dummy;
    });

    expect(ret).toBe(dummy);
  });

  it("tx should be callable", async () => {
    await transaction((tx) => {
      tx({ fn: () => {}, rollback: () => {} });
    });
  });

  it("fn should be called", async () => {
    const fn = mock(() => {});
    await transaction((tx) => {
      tx({ fn, rollback: () => {} });
    });

    expect(fn.mock.calls.length).toBe(1);
  });

  it("rollback should be called", async () => {
    const fn = mock(() => {});
    const rollback = mock(() => {});

    try {
      await transaction((tx) => {
        tx({ fn, rollback });
        throw new Error("test");
      });
    } catch (error) {
      expect((error as any).message).toBe("test");
    }

    expect(fn.mock.calls.length).toBe(1);
    expect(rollback.mock.calls.length).toBe(1);
  });

  it("rollback should be called in correct order", async () => {
    const order: any[] = [];
    const fn = mock(() => {});
    const fn2 = mock(() => {});
    const rollback = mock(() => {
      order.push(rollback);
    });
    const rollback2 = mock(() => {
      order.push(rollback2);
    });

    try {
      await transaction((tx) => {
        tx({ fn, rollback });
        tx({ fn: fn2, rollback: rollback2 });
        throw new Error("test");
      });
    } catch (error) {
      expect((error as any).message).toBe("test");
    }

    expect(fn.mock.calls.length).toBe(1);
    expect(rollback.mock.calls.length).toBe(1);
    expect(fn2.mock.calls.length).toBe(1);
    expect(rollback2.mock.calls.length).toBe(1);
    expect(order[0]).toEqual(rollback2);
    expect(order[1]).toEqual(rollback);
  });

  it("tx should return fn response", async () => {
    const dummy = { a: "b" };
    const fn = mock(() => dummy);
    const rollback = mock(() => {});

    await transaction((tx) => {
      const r = tx({ fn, rollback });
      expect(r).toBe(dummy);
    });
  });

  it("tx should return async fn response", async () => {
    const dummy = { a: "b" };
    const fn = mock(async () => dummy);
    const rollback = mock(() => {});

    await transaction(async (tx) => {
      const r = await tx({ fn, rollback });
      expect(r).toBe(dummy);
    });
  });

  it("async transaction should return proper response", async () => {
    const dummy = { a: "b" };
    const fn = mock(async () => dummy);
    const rollback = mock(() => {});

    const r = await transaction(async (tx) => {
      return await tx({ fn, rollback });
    });
    expect(r).toBe(dummy);
  });

  it("should timeout", async () => {
    const fn = mock(
      async () =>
        new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 1000);
        }),
    );
    const rollback = mock(() => {});

    try {
      await transaction(
        async (tx) => {
          await tx({ fn, rollback });
        },
        { timeout: 1 },
      );
    } catch (error) {
      expect((error as any).message).toBe("Transaction timed out after 1ms");
    }
  });

  it("rollback error should be called", async () => {
    const fn = mock(() => {});
    const fn2 = mock(() => {});
    const rollback = mock(() => {
      throw new Error("rollback error");
    });
    const rollback2 = mock(() => {});
    const abortRollbackReporter = mock(() => {});

    try {
      await transaction(
        (tx) => {
          tx({ fn, rollback });
          tx({ fn: fn2, rollback: rollback2 });
          throw new Error("test");
        },
        { abortRollbackReporter: abortRollbackReporter },
      );
    } catch (error) {
      expect((error as any).message).toBe("rollback error");
    }

    expect(fn.mock.calls.length).toBe(1);
    expect(rollback.mock.calls.length).toBe(1);
    expect(fn2.mock.calls.length).toBe(1);
    expect(rollback2.mock.calls.length).toBe(1);
    expect(abortRollbackReporter.mock.calls.length).toBe(1);
  });

  it("rollback error should be called multiple times", async () => {
    const fn = mock(() => {});
    const fn2 = mock(() => {});
    const rollback = mock(() => {
      throw new Error("rollback error");
    });
    const rollback2 = mock(() => {
      throw new Error("rollback error");
    });
    const abortRollbackReporter = mock(() => {});

    try {
      await transaction(
        (tx) => {
          tx({ fn, rollback });
          tx({ fn: fn2, rollback: rollback2 });
          throw new Error("test");
        },
        { abortRollbackReporter: abortRollbackReporter, abortRollback: false },
      );
    } catch (error) {
      expect((error as any).message).toBe("test");
    }

    expect(fn.mock.calls.length).toBe(1);
    expect(rollback.mock.calls.length).toBe(1);
    expect(fn2.mock.calls.length).toBe(1);
    expect(rollback2.mock.calls.length).toBe(1);
    expect(abortRollbackReporter.mock.calls.length).toBe(2);
  });

  it("rollback error should be called multiple times with parallel rollbacks", async () => {
    const fn = mock(() => {});
    const fn2 = mock(() => {});
    const rollback = mock(() => {
      throw new Error("rollback error");
    });
    const rollback2 = mock(() => {
      throw new Error("rollback error");
    });
    const abortRollbackReporter = mock(() => {});

    try {
      await transaction(
        (tx) => {
          tx({ fn, rollback });
          tx({ fn: fn2, rollback: rollback2 });
          throw new Error("test");
        },
        {
          abortRollbackReporter: abortRollbackReporter,
          abortRollback: false,
          maintainRollbackOrder: false,
        },
      );
    } catch (error) {
      expect((error as any).message).toBe("test");
    }

    expect(fn.mock.calls.length).toBe(1);
    expect(rollback.mock.calls.length).toBe(1);
    expect(fn2.mock.calls.length).toBe(1);
    expect(rollback2.mock.calls.length).toBe(1);
    expect(abortRollbackReporter.mock.calls.length).toBe(2);
  });
});
