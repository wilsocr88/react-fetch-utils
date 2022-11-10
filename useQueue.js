import { useState } from "react";

/**
 * Every time a fetch call is made to the API, keep track of it with this hook.
 * This way, you can cancel a long fetch before you start another, so your UI
 * doesn't flicker when an old, obsolete fetch completes.
 * In your component, initialize the query list like any react hook:
 *      const queue = useQueue();
 * Then keep track of any fetch calls with it:
 *      // Cancel all before you fetch:
 *      queue.cancelAll();
 *      // do your fetch inside an async promise function which has an AbortController.abort() cancellation method:
 *      let query = getThings();
 *      // keep track of it in the query list:
 *      queue.add(query);
 *      query.then(() => {
 *          // remove it from the list when it completes
 *          queue.remove(query);
 *      }).catch(e => {
 *          // Make sure you catch the AbortError
 *      });
 * @returns {object} [list] of queries, cancelQuery(), addQuery(query), removeQuery(query)
 */
export default function useQueue() {
    const [list, setList] = useState([]);
    return {
        list,
        cancelAll: () => {
            let tempList = list;
            if (tempList.length > 0) {
                tempList.forEach(q => {
                    q.cancel();
                    tempList.splice(q);
                });
                setList(tempList);
            }
        },
        add: query => {
            let tempList = list;
            tempList.push(query);
            setList(tempList);
        },
        remove: query => {
            let tempList = list;
            tempList.splice(query);
            setList(tempList);
        },
    };
}
