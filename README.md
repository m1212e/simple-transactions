# simple-transactions
A simple transaction wrapper for JavaScript. Allows to register rollback functions during a transaction run. Rollback functions will be called in reverse order if the transaction throws an error.

## Getting Started
```bash
bun add @m1212e/simple-transactions
npm i @m1212e/simple-transactions
```
```ts
    try {
      // create a transaction
      await transaction((tx) => {
        // register a function with a rollback function
        // this could be an API call to create an entity
        // in case of failure, the delete call will be called to rollback the creation
        tx({ fn: workingCreationCall, rollback: workingDeletionCall });
        tx({ fn: fn2, rollback: rollback2 });
        throw new Error("test");
      });
    } catch (error) {
      console.error(error.message); // test
    }
```