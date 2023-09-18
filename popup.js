const topicField = document.getElementById('topic');
const searchTermField = document.getElementById('searchTerm');
const numMessagesField = document.getElementById('numMessages');
const searchBtn = document.getElementById('searchBtn');

chrome.storage.sync.get('state', ({ state }) => {
    searchTermField.value = state.searchTerm
    numMessagesField.value = state.numMessages
    topicField.value = state.topic
});

searchBtn.addEventListener('click', async function() {
    const topic = topicField.value
    const searchTerm = searchTermField.value
    const numMessages = parseInt(numMessagesField.value)
    if (!topic) {
        alert('Invalid topic')
        return
    }
    if (!searchTerm) {
        alert('Invalid search term')
        return
    }
    if (isNaN(numMessages) || numMessages < 1 || numMessages > 100000) {
        alert('Invalid number of messages. Please choose a number between 1 and 10000.')
        return
    }

    chrome.storage.sync.set({ state: { topic, searchTerm, numMessages } });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // trigger the searchScript in the active tab (must be the kafdrop tab)
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: searchScript
    });
});

const searchScript = () => {
    const host = `${window.location.protocol}//${window.location.host}`

    async function search(state) {
        const topicDetails = await getTopicDetails(state.topic)

        if (!topicDetails || !Array.isArray(topicDetails.partitions)) {
            console.error("topicDetails: response is not json")
            return
        }

        let messagesFound = [];
        for (const key in topicDetails.partitions) {
            const partition = topicDetails.partitions[key]

            const messagesFoundInPartition = await searchInPartition(state, partition)
            messagesFound = {...messagesFound, ...messagesFoundInPartition}
        }

        localStorage.setItem("messagesFound", JSON.stringify(messagesFound))
        console.log("Messages found:", messagesFound)
    }

    async function searchInPartition(state, partition) {
        let offset = partition.size - state.numMessages
        if (offset < 0) {
            offset = 0
        }

        const messages = await searchPage(state.topic, partition.id, offset, state.numMessages)

        if (!messages || !Array.isArray(messages)) {
            console.error("searchInPartition: response is not json")
            return
        }

        let messagesFoundInPartition = []
        messages.forEach((item) => {
            if (item.message.includes(state.searchTerm)) {
                messagesFoundInPartition.push(item)
            }
        });

        return messagesFoundInPartition
    }

    async function getTopicDetails(topic) {
        let url = `${host}/topic/${topic}`
        const res = await fetch(url, {headers: {"Accept": "application/json"}})
        return await res.json()
    }

    async function searchPage(topic, partition, offset, count) {
        let url = `${host}/topic/${topic}/messages?partition=${partition}&offset=${offset}&count=${count}&keyFormat=DEFAULT&format=DEFAULT`
        const res = await fetch(url, {headers: {"Accept": "application/json"}})
        return await res.json()
    }

    // get the state and starts the search
    chrome.storage.sync.get('state', ({ state }) => search(state))
}
