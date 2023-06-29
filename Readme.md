# FetchPromise
Usage:
```
import FetchPromise from './FetchPromise';
export function getThingFromAPI() {
    return FetchPromise({
        url: "https://api.example.com/2/things/search",
        method: "POST",
        body: {
            // ...
        }
    });
}

// In component:

const { status, response } = useRequest(getThingFromAPI);
```

# useRequest hook

Pass it a Promise function that performs a fetch call and it will track its lifecycle and cache the results

Initialize the hook:

`const { status, response } = useRequest(getList);`

And use the effect:

```
useEffect(() => {
    if (!response || !status || status < 2) return;
    // use response
}, [status, response]);
```

You can also pass `true` as a second argument to disable caching and force a re-fetch every time:

`const { status, response } = useRequest(getList, true);`

__Note:__ The `useRequest` hook makes use of the `useQueries` hook to track its fetch queries. If you wish, you may use it directly:

# useQueries hook
__Note:__ This hook is used within `useRequest`.

Every time a fetch call is made to the API from React, keep track of it with this hook. This way, you can cancel a long fetch before you start another, so your UI doesn't flicker when an old, obsolete fetch completes.

In your component, initialize the query list like any React hook:

`const queries = useQueries();`

Then keep track of any fetch calls with it:

1. Cancel all before you fetch:

`queries.cancelAll();`

2. Do your fetch inside an async promise function which has an AbortController.abort() cancellation method, and return it directly to a variable:

`let query = getThingsFromAPI();`

3. Keep track of it in the query list:

`queries.add(query);`

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
