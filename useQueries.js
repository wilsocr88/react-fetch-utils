import { useState } from "react";
export default function useQueries() {
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
