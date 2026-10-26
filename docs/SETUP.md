# Setup guide

About 15 minutes. You need a Google account and a GitHub account.

## 1. Make the Google Sheet (your database)

1. Go to [sheets.new](https://sheets.new) and name the sheet, for example **Money Plan**. Keep it private: don't share it.
2. Open **Extensions › Apps Script**.
3. In the editor:
   1. Replace everything in `Code.gs` with the contents of [`apps-script/Code.gs`](../apps-script/Code.gs).
   2. Click **Project Settings** (the gear icon) and tick **Show "appsscript.json" manifest file in editor**.
   3. Back in the **Editor**, replace `appsscript.json` with [`apps-script/appsscript.json`](../apps-script/appsscript.json). This limits the script to this one spreadsheet.
4. Set your passcode:
   1. Open **Project Settings › Script properties › Add script property**.
   2. Set **Property** to `PASSCODE`.
   3. Set **Value** to a passphrase of at least 10 characters, for example four random words.
   4. Click **Save**.
   - Anyone with the passcode and the link below can see your budget, so pick something long that you don't use anywhere else.
5. Run the setup:
   1. In the editor, choose the function `setup` in the toolbar and click **Run**.
   2. Approve the permissions. Google warns that the app isn't verified; it's your own script, so choose **Advanced › Go to project**.
   3. The sheet now has tabs: Settings, IncomeSources, RecurringBills, Paydays, PaydayBills…
6. Deploy the web app:
   1. Click **Deploy › New deployment**.
   2. Click the gear and choose **Web app**.
   3. Set **Execute as** to **Me**.
   4. Set **Who has access** to **Anyone**. The browser app can't sign in to Google, so this is required; the passcode protects your data.
   5. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
   - Keep this link private: don't paste it into chats, issues or code. The scan blocks it from git.

## 2. Put the site on GitHub Pages

1. On GitHub, create a **public**, empty repository named `finance-tracker`, with no README.
2. Push this folder to it:
   ```sh
   git remote add origin https://github.com/johnlesterleycano/finance-tracker.git
   git push -u origin main
   ```
3. In the repo, open **Settings › Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab. The "Test and deploy" workflow runs the data scan and the tests, then publishes the site at `https://johnlesterleycano.github.io/finance-tracker/`.

## 3. Connect your phone

1. Open the site on your phone.
2. Paste the `/exec` link, enter the passcode, and tap **Connect my Sheet**.
3. Install it as an app:
   - **iPhone (Safari):** Share › Add to Home Screen.
   - **Android (Chrome):** menu › Install app.
4. On a second phone (for example a partner's), do the same with the same link and passcode.

The phone keeps a random device token, not the passcode. To lock everyone out (for example, after losing a phone), use **Trends › Your data › Sign out all devices**, or run `signOutAllDevices` in the Apps Script editor.

## Updating the backend later

After changing `Code.gs`:
1. Click **Deploy › Manage deployments**.
2. Click the pencil icon and set **Version** to **New version**.
3. Click **Deploy**.

The link stays the same.

## Good to know

- **Editing the Sheet directly is fine.** Keep the header row and the column names as they are. The app reads by column name, and it fixes bad values (a typo in an amount becomes 0) instead of crashing.
- **Backup:** the Sheet keeps its own history in File › Version history. Trends › Your data › Export backup also downloads a JSON copy. Keep that file out of the repo; the scan blocks it anyway.
- **Changing the passcode:** edit the `PASSCODE` script property, then run `signOutAllDevices` and reconnect each phone.
