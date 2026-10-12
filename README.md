# REC QR Lost & Found

A responsive college mini project for registering owners, making QR tags for belongings, and letting a finder contact the owner without seeing their phone number.

## Project overview

| Layer | Technology | Purpose |
|---|---|---|
| Front end | HTML5, CSS3, JavaScript | Pages, responsive design, form handling, QR display, chat and location UI |
| Backend/data service | Firebase Realtime Database (REST API) | Shared tags, owner tag lists, chat messages and location across devices |
| Browser-only demo mode | `localStorage` | Lets you learn and demo on one browser without Firebase |
| Hosting | Netlify Drop or GitHub Pages | Provides a public HTTPS address for phone scans and GPS |

The Firebase adapter is connected in `js/app.js` to the classroom database `rec-qr-lost-and-found-demo-default-rtdb`. The current account/password flow is intended for a classroom prototype; see **Security and project limits** before publishing it for public use.

## Run locally

1. Install [Visual Studio Code](https://code.visualstudio.com/) and the **Live Server** extension.
2. Open this `lost-found` folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server**.
4. Register and create a tag. QR generation loads QRCode.js from a CDN, so allow internet access.

If you clear `DB_URL`, data is saved only in the current browser. A different browser, phone, or private window will not see it.

## Configure the shared backend

This uses Firebase Realtime Database as a hosted backend; there is no separate server to install.

The database is already created and configured for this project. Its database reference is `https://rec-qr-lost-and-found-demo-default-rtdb.firebaseio.com`. The instance is in `us-central1`.

For a fresh Firebase project in a different copy of this app:

1. Create a project and a Realtime Database in the Firebase console.
2. Copy the database URL from the Data tab. It resembles `https://PROJECT-default-rtdb.REGION.firebasedatabase.app`.
3. Open `js/app.js` and set `DB_URL` near the top to that URL, keeping the quotes:

   ```js
   const DB_URL = "https://PROJECT-default-rtdb.REGION.firebasedatabase.app";
   ```

4. Save, refresh the site and register a new demo account. Create a fresh tag after hosting so its QR points to the hosted address.

The app writes records under `users`, `userTags`, `tags`, and `chats`. It polls the database every few seconds for new chat messages and location updates.

### Important security limit

The database currently uses test rules that allow anyone with its URL to read, change, and delete data until **November 11, 2026**. Do not put real personal data, real passwords, or live location in it. Firebase's console will require the rules to be changed after that date. The app does **not** use Firebase Authentication; accounts are app-level demo records and password fingerprints. Do not present this as a production-secure backend. A production release needs Firebase Authentication (or a server that authenticates users), access rules that enforce ownership and allow the finder only the minimum needed, server-side validation, and abuse controls. Secure rules cannot safely be enabled without changing this prototype's authentication/data model.

## Use it on a phone

### Recommended: host it on HTTPS

1. Finish the Firebase setup above if you want the phone and laptop to share tags and chat.
2. Deploy the **contents of this `lost-found` folder** to a static host. For a quick class demo, sign in at [Netlify Drop](https://app.netlify.com/drop) and drag the folder onto the page. GitHub Pages is another option.
3. Open the resulting `https://...` website on your laptop and register there. Create a **new tag** on the hosted site. Its QR now contains the public address.
4. Show the QR on the laptop, then use the phone camera app to scan it. Tap the banner/link that appears; the finder page should open in the phone browser.
5. On the finder page, tap **Chat with owner**. Keep the owner logged in on the laptop dashboard/chat and the finder on the phone. Send a message from each side.
6. On the phone, tap **Share my live location** and allow location permission. The browser may ask again when sharing starts. GPS requires HTTPS and permission; indoor accuracy can vary.
7. When the item is handed back, the owner taps **Mark as returned**.

If your camera does not recognize the code, open the hosted home page in the phone browser and enter the tag code printed below the QR. Do not use a `localhost` QR on a phone: `localhost` means that particular device, not your laptop.

### Quick phone preview on the same Wi-Fi (no GPS guarantee)

You can use Live Server's network address if both devices are on the same Wi-Fi, but the page may not have HTTPS. This is useful for viewing layout; camera behavior, location permission, and cross-device data may be blocked or unavailable. For the real flow, use the hosted HTTPS address above.

## Pages and files

| File | Role |
|---|---|
| `index.html` | Landing page and tag-code lookup |
| `register.html`, `login.html` | Owner demo account forms |
| `dashboard.html` | Owner's tag list and message counts |
| `create-tag.html` | Item tag creation |
| `qr.html` | Printable/downloadable QR sticker |
| `found.html` | Finder view for a scanned tag |
| `chat.html` | Owner/finder conversation, location sharing and return status |
| `css/style.css` | Responsive visual styles |
| `js/app.js` | Page logic, database adapter and browser APIs |

## Demo walkthrough

1. Register as the owner on the laptop.
2. Create a tag, then open its QR sticker.
3. Scan that QR using the phone.
4. Send a finder message and reply as the owner.
5. Share the phone's location, then mark the item returned from the owner side.

For the simulated two-role chat on one browser, open `chat.html?id=TAGCODE` as owner and `chat.html?id=TAGCODE&as=finder` as finder. Use Firebase for separate devices; local storage alone cannot sync between them.

## Viva notes

- **How does a QR code work?** It stores a URL with a tag ID. `found.html` reads that ID from the query string and loads the item.
- **How is owner privacy handled?** The finder is given a chat route instead of the owner's phone number.
- **How does cross-device chat work?** Both browsers read and write chat records in Firebase; this prototype polls periodically for updates.
- **How does location work?** The browser Geolocation API provides coordinates after permission; the app displays a map link/embed.
- **Why is hosting needed?** A second phone cannot reach the laptop's `localhost`, and browser geolocation generally requires a secure HTTPS origin.
- **What would be improved for a real service?** Firebase Authentication, restrictive database rules, input/rate limits, retention controls for location data, and real-time database listeners.

## Submission checklist

- Add your name, class, institution and date to the report/cover page before submitting.
- Configure Firebase and verify the multi-device demo before presenting it.
- Use a newly created tag on the final hosted URL; old QRs may point to a local or earlier URL.
- Keep the Firebase demo database free of real personal information and remove demo data after evaluation.
