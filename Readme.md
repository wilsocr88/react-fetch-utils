# useQueries hook

Every time a fetch call is made to the API from React, keep track of it with this hook. This way, you can cancel a long fetch before you start another, so your UI doesn't flicker when an old, obsolete fetch completes.

In your component, initialize the query list like any React hook:

     const queries = useQueries();

Then keep track of any fetch calls with it:

1. Cancel all before you fetch:

```queries.cancelAll();```
     
2. Do your fetch inside an async promise function which has an AbortController.abort() cancellation method, and return it directly to a variable:

```let query = getThingsFromAPI();```
     
3. Keep track of it in the query list:

```queries.add(query);```

4. Remove it from the list when it completes:

```
query.then(res => {
    queries.remove(query);
    //...
}).catch(e => {
    // Make sure you catch the AbortError
    if (e.details.name === "AbortError") return;
});
```
