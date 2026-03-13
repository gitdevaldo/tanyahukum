# AI Agent Rules

When using the `browser_subagent` or opening URLs in the browser, follow these rules strictly:
1. Do not endlessly open new tabs.
2. Before opening a new URL, ALWAYS check the current open tabs in the user's state metadata to see if there is an unused tab, or if a tab is already located at the target URL.
3. If there is a suitable existing tab, reuse it instead of opening a new one (e.g., by executing JS to change `window.location.href`).
4. Keep the workspace clean by minimizing the number of open tabs.
5. ALWAYS ensure the local backend (`localhost:8000`) and frontend (`localhost:3001`) servers are running before attempting to use the browser. Start them using `uvicorn` and `npm run dev` if they are not active.
6. **CRITICAL:** Before calling the `browser_subagent` or `open_browser_url`, you MUST perform an HTTP ping (e.g., using `read_url_content` or PowerShell `Invoke-WebRequest` on `http://localhost:3001`) to verify the server is actually responding. Do NOT guess based on the process ID list.
