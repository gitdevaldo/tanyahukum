---
description: Rules for using the browser subagent and managing browser tabs
---

When using the `browser_subagent` or opening URLs in the browser, follow these rules:
1. Do not endlessly open new tabs.
2. Before opening a new URL, check the current open tabs to see if there is an unused tab, or if a tab is already located at the target URL.
3. If there is a suitable existing tab, reuse it instead of opening a new one.
4. Keep the workspace clean by minimizing the number of open tabs.
