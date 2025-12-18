# simple-transactions
A simple transaction wrapper for JavaScript. Allows to register rollback functions during a transaction run. Rollback functions will be called in reverse order if the transaction throws an error.

## Getting Started
```bash
bun add @m1212e/simple-transactions
npm i @m1212e/simple-transactions
```

## Usage
```ts
    import { transaction } from '@m1212e/simple-transactions';

    try {
      // create a transaction
      const returnOfTransactionIsReturnOfFn2 = await transaction((tx) => {
        // register a call with a rollback function
        // this could be an API fetch to create an entity
        // in case of failure, the delete call will be called to rollback the creation
        tx({ fn: workingCreationCall, rollback: workingDeletionCall });
        
        // you can register multiple functions with rollback functions inside one transaction
        tx({ fn: fn1, rollback: rollback1 });
        // the return value of fn2 will be returned by the transaction call
        const retOfFn2 = tx({ fn: fn2, rollback: rollback2 });
        
        // when this error is thrown, the rollback begins and after completing, the error will be thrown again by the transaction call
        throw new Error("test"); 
        
        // if there would be not error inside the call before the return statement, the transaction will be successful and the return value of fn2 will be returned
        return retOfFn2;
      });
    } catch (error) {
      // Before throwing the error we catch here, rollback2 -> rollback1 -> workingDeletionCall are called and awaited completely
      // at this point the transaction is already rolled back

      console.error(error.message); // test
    }
```
## Configuration
You can configure the transaction with a few helpful options passed as the second parameter.
```ts
  const returnOfTransactionIsReturnOfFn2 = await transaction((tx) => {...}, 
    { timeout: 1000 } // error after 1 second if the transaction is not completed by then
  );
```
