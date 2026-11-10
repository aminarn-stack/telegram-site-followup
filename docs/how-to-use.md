# How to Use — راهنمای استفاده

This guide describes the current user workflow in the repository.  
این راهنما روش استفاده از نسخه فعلی سامانه را توضیح می‌دهد.

---

# English

## 1. What the application does

Telegram Site Follow-up is a weekly site-implementation tracking system. Administrators import the weekly site list, and authorized users update each site's workflow through the web dashboard or Telegram Mini App. The system keeps workflow history, evidence, comments, blockers, notifications, and audit records.

## 2. Open the application

1. Open the Telegram bot in a private chat and press **Start** (or send `/start`).
2. Use **Open** / `/open` to launch the Mini App.
3. You can also open the deployed HTTPS web address in a browser.
4. Sign in through Telegram. Your available sites and reports depend on your assigned service-center (SC) permissions.

For local development, open `http://localhost:5173`. The development environment signs in as the seeded administrator; this development shortcut is not available in production.

## 3. Weekly site import (Administrators)

1. Prepare the weekly CSV or Excel file. It must contain these columns:
   - `Site ID`
   - `Region`
   - `SC`
   - `Shared Site Or Normal Site`
   - `Add sector included or Not`
2. Include both **Region** and **SC** for every site. Use the sample file at `samples/weekly-import-sample.csv` as a template.
3. In the Administration area, open the weekly import function, select the reporting-week date, and upload the file.
4. Review the preview, accepted/rejected row counts, and any validation errors. You can download the error list to correct the source file.
5. Correct the file and upload it again if needed. A batch containing rejected rows cannot be committed; the import is all-or-nothing.
6. When the preview is fully valid, commit the import. The committed import creates or updates the active site list and workflows.
7. Check the import summary notification and dashboard totals.

Imports support CSV and XLSX files and validate 1–40 rows per batch. Region and SC codes are discovered from committed imports; they are not manually created in Administration.

## 4. Work on a site

1. Open the dashboard or the site list.
2. Search for a site by Site ID, or filter the list by reporting week, Region, SC, site type, sector addition, status, or assignee.
3. Open a site to see its workflow, current step statuses, comments, evidence, blockers, and history.
4. Work on the next available/unlocked step. Prerequisite steps must be completed before dependent steps can proceed.
5. Select one of the answers offered for that step. Some answers require a comment; explain the result or blocker clearly.
6. Upload supporting evidence when requested or useful. Supported evidence formats are JPEG, PNG, WebP, and PDF.
7. Save the update and continue with the next unlocked step.

Do not try to bypass a locked step. Check its prerequisite steps and resolve the outstanding dependency first. If a step needs to be reopened, an administrator must reopen it with a reason; completed dependent steps may then be marked **Needs Review**.

## 5. BP issuance milestone

When the workflow reaches **BP issuance by RMPS**:

1. Open that step.
2. If appropriate, select **Done - All previous steps considered as Done**.
3. If the step is locked, an authorized user can use **Set BP milestone**.
4. This milestone closes the applicable earlier steps and unlocks the next steps that depend on BP. Earlier answers, comments, and evidence remain in the history.
5. Administrators can use **Reopen BP milestone** to restore prerequisite checks.

Use the milestone only when the business decision to treat the previous steps as complete has been confirmed.

## 6. License branch

After BP issuance, every workflow includes **License required**:
- Choose **Yes** when a license is required. The **License issuance** step then becomes available and can be marked **Done** or **Not Done**.
- Choose **Requested - No** when a license is not applicable.
- The existing downstream steps continue to depend on BP, not on completion of the license branch.

## 7. Telegram bot commands

Use commands in the bot chat or in a configured Telegram group:

| Command | What it does |
| --- | --- |
| `/start` | Start the bot and open the entry point. |
| `/open` | Show the button to open the Mini App. |
| `/summary` | Send a summary for the permitted SC scope. |
| `/remind` | Request a reminder for pending work in the permitted scope. |
| `/export` | Send the current site summary and each step's status as an Excel workbook. |
| `/flowexport` | Send a workbook organized by SC, Region, and Site ID, with current steps, statuses, answers, and directly dependent next steps. |
| `/pending` | Send an Excel workbook of pending steps by owner, including affected-site counts. |
| `/help` | Show bot help. |

In a group where Telegram privacy mode is enabled, address the command to the bot, for example `/export@YourBotUsername`. Open the bot's private chat from the group's **Open** button and start the private chat once to receive Excel exports there.

## 8. Pending work and ownership

The pending report groups actionable, blocked, or review-needed steps by owner:
- **MTNI:** Installation plan by RND, BP issuance by RMPS, Core/SID/CGI/IP receipt, Material delivery, and Sharing result.
- **Contractor:** The remaining workflow steps.

Pending time measures the current continuous period during which a step has been actionable, blocked, or awaiting review. A site may be counted under both owners. The site card and export summary show the oldest pending step for each owner; Step Details shows the duration for each individual step.

## 9. Access permissions and Telegram groups (Administrators)

1. In Administration, add or update users and assign their role and permitted SC codes.
2. Assign contributors and viewers only the SCs they are responsible for.
3. In **Administration → Telegram groups and reminders**, register each Telegram group's chat ID and assign its SC codes.
4. Assign at least one SC to every group that should receive site information. A group without an SC assignment is intentionally blocked from receiving site data.
5. A non-admin user's group command is restricted to the intersection of the user's permitted SCs and the group's assigned SCs.
6. An administrator's command in a configured group uses that group's scope. The same command in a private chat covers all SCs.
7. Administrators can use the dashboard for combined totals, per-team/SC breakdowns, and all-SC or per-SC exports.

Region is a reporting/filtering field; SC is the access-control boundary. One SC can contain sites from multiple regions.

## 10. Weekly close and archive (Administrators)

At the end of a reporting week, use **Administration → Archive current plan**. This preserves workflows and audit history while clearing site IDs from the active dashboard. Committing the next weekly import activates the sites included in that new file.

## 11. Important operating notes

- Telegram Mini App and webhook URLs must use HTTPS; plain HTTP is not supported for production Telegram use.
- Keep bot tokens, webhook secrets, database credentials, and other secrets private. Never put them in a CSV or share them in Telegram groups.
- Evidence is delivered as an authenticated attachment.
- Notifications use the configured timezone (initially Asia/Tehran); notification event times are displayed with the UTC offset.
- If a command does not return data, check the user's SC access and the Telegram group's SC assignments first.
- For technical deployment, backups, and troubleshooting, see the main README and the operations documentation.

---

# فارسی

## ۱. سامانه چه کاری انجام می‌دهد؟

سامانه **Telegram Site Follow-up** برای پیگیری هفتگی وضعیت اجرای سایت‌ها طراحی شده است. مدیر سیستم فهرست سایت‌های هر هفته را وارد می‌کند و کاربران مجاز از طریق داشبورد وب یا مینی‌اپ تلگرام، مراحل اجرایی هر سایت را به‌روزرسانی می‌کنند. سوابق مراحل، توضیحات، مدارک، موانع، اعلان‌ها و گزارش فعالیت‌ها در سامانه نگهداری می‌شود.

## ۲. ورود به سامانه

۱. ربات تلگرام را در گفت‌وگوی خصوصی باز کنید و روی **Start** بزنید یا دستور `/start` را ارسال کنید.  
۲. با انتخاب گزینه **Open** یا ارسال دستور `/open`، مینی‌اپ را باز کنید.  
۳. همچنین می‌توانید نشانی HTTPS سامانه را مستقیماً در مرورگر باز کنید.  
۴. از طریق تلگرام وارد شوید. فهرست سایت‌ها و گزارش‌هایی که مشاهده می‌کنید، بر اساس دسترسی شما به مراکز خدمات (SC) تعیین می‌شود.

در محیط توسعه محلی، نشانی `http://localhost:5173` قابل استفاده است. ورود آزمایشی مدیر در محیط توسعه فعال است و در نسخه عملیاتی وجود ندارد.

## ۳. وارد کردن فهرست هفتگی سایت‌ها (ویژه مدیران)

۱. فایل هفتگی را با فرمت CSV یا Excel آماده کنید. فایل باید شامل ستون‌های زیر باشد:
   - `Site ID` — شناسه سایت
   - `Region` — منطقه
   - `SC` — مرکز خدمات
   - `Shared Site Or Normal Site` — سایت اشتراکی یا عادی
   - `Add sector included or Not` — وجود یا عدم وجود افزودن سکتور

۲. برای تمام سایت‌ها، هر دو مقدار **Region** و **SC** را وارد کنید. فایل نمونه `samples/weekly-import-sample.csv` را می‌توانید به‌عنوان الگو استفاده کنید.

۳. در بخش مدیریت، قسمت ورود اطلاعات هفتگی را باز کنید، تاریخ هفته گزارش را انتخاب و فایل را بارگذاری کنید.

۴. پیش‌نمایش، تعداد ردیف‌های پذیرفته‌شده و ردشده و خطاهای اعتبارسنجی را بررسی کنید. در صورت وجود خطا می‌توانید فایل جزئیات خطاها را دانلود کنید.

۵. خطاهای فایل اصلی را اصلاح و در صورت نیاز دوباره بارگذاری کنید. تا زمانی که حتی یک ردیف دارای خطای ردشده باشد، امکان ثبت نهایی کل فایل وجود ندارد؛ ثبت اطلاعات به‌صورت یکپارچه انجام می‌شود.

۶. پس از معتبر شدن تمام ردیف‌ها، گزینه ثبت نهایی (Commit) را انتخاب کنید. اطلاعات ثبت‌شده، فهرست فعال سایت‌ها و گردش‌کار آن‌ها را ایجاد یا به‌روزرسانی می‌کند.

۷. پیام خلاصه ورود اطلاعات و آمار داشبورد را بررسی کنید.

در هر نوبت ورود اطلاعات، فایل CSV یا XLSX با تعداد ۱ تا ۴۰ ردیف پذیرفته می‌شود. کدهای Region و SC پس از ثبت نهایی فایل شناسایی می‌شوند و نیازی به تعریف دستی آن‌ها در بخش مدیریت نیست.

## ۴. پیگیری و به‌روزرسانی یک سایت

۱. داشبورد یا فهرست سایت‌ها را باز کنید.  
۲. با شناسه سایت جست‌وجو کنید یا از فیلترهای هفته گزارش، منطقه، مرکز خدمات، نوع سایت، افزودن سکتور، وضعیت و مسئول استفاده کنید.  
۳. سایت موردنظر را باز کنید تا مراحل اجرایی، وضعیت هر مرحله، توضیحات، مدارک، موانع و سوابق آن را ببینید.  
۴. از اولین مرحله‌ای که باز و قابل انجام است شروع کنید. مراحل وابسته تا تکمیل پیش‌نیازهایشان قابل انجام نیستند.  
۵. یکی از پاسخ‌های مجاز همان مرحله را انتخاب کنید. اگر سامانه توضیح می‌خواهد، نتیجه کار یا علت توقف را روشن و دقیق بنویسید.  
۶. در صورت نیاز، مدرک مرتبط را بارگذاری کنید. فرمت‌های قابل قبول JPEG، PNG، WebP و PDF هستند.  
۷. تغییرات را ذخیره کنید و به مرحله بعدی که باز شده است بروید.

برای عبور از یک مرحله قفل‌شده تلاش نکنید. ابتدا پیش‌نیازهای آن را بررسی و تکمیل کنید. اگر لازم است مرحله‌ای دوباره باز شود، مدیر سیستم باید آن را همراه با ثبت دلیل بازگشایی کند. در این حالت ممکن است مراحل تکمیل‌شده وابسته به وضعیت **Needs Review** (نیازمند بازبینی) تغییر کنند.

## ۵. نقطه عطف BP issuance

هنگامی که گردش‌کار به مرحله **BP issuance by RMPS** رسید:

۱. این مرحله را باز کنید.  
۲. اگر از نظر اجرایی تأیید شده است، گزینه **Done - All previous steps considered as Done** را انتخاب کنید.  
۳. اگر مرحله قفل است، کاربر دارای مجوز می‌تواند از گزینه **Set BP milestone** استفاده کند.  
۴. با ثبت این نقطه عطف، مراحل قبلیِ مشمول این تصمیم بسته می‌شوند و مراحل وابسته به BP باز خواهند شد. پاسخ‌ها، توضیحات و مدارک قبلی همچنان در سوابق باقی می‌مانند.  
۵. مدیر سیستم در صورت نیاز می‌تواند با گزینه **Reopen BP milestone** بررسی پیش‌نیازها را دوباره فعال کند.

این گزینه را فقط زمانی انتخاب کنید که تصمیم کاری برای تکمیل‌شده در نظر گرفتن مراحل قبلی تأیید شده باشد.

## ۶. شاخه مربوط به مجوز (License)

پس از مرحله BP issuance، در تمام گردش‌کارها مرحله **License required** وجود دارد:

- اگر مجوز لازم است، گزینه **Yes** را انتخاب کنید. سپس مرحله **License issuance** باز می‌شود و می‌توان وضعیت آن را **Done** یا **Not Done** ثبت کرد.
- اگر مجوز موردنیاز نیست، گزینه **Requested - No** را انتخاب کنید تا مرحله صدور مجوز غیرقابل‌اعمال محسوب شود.
- مراحل بعدی همچنان بر اساس BP باز می‌شوند و تکمیل شاخه مجوز پیش‌نیاز آن‌ها نیست.

## ۷. دستورات ربات تلگرام

دستورات را در گفت‌وگوی خصوصی ربات یا گروه تلگرامی پیکربندی‌شده ارسال کنید:

| دستور | کاربرد |
| --- | --- |
| `/start` | شروع کار با ربات و نمایش نقطه ورود |
| `/open` | نمایش دکمه ورود به مینی‌اپ |
| `/summary` | ارسال خلاصه وضعیت در محدوده مراکز خدمات مجاز |
| `/remind` | درخواست یادآوری برای کارهای در انتظار در محدوده مجاز |
| `/export` | ارسال فایل Excel شامل خلاصه سایت‌ها و وضعیت هر مرحله |
| `/flowexport` | ارسال فایل Excel بر اساس SC، منطقه و شناسه سایت، همراه با مراحل و پاسخ‌های فعلی و مراحل بعدیِ مستقیماً وابسته |
| `/pending` | ارسال فایل Excel مراحل در انتظار به تفکیک مسئول و تعداد سایت‌های مربوط |
| `/help` | نمایش راهنمای دستورات ربات |

در گروه‌هایی که Privacy Mode تلگرام فعال است، دستور را همراه با نام کاربری ربات ارسال کنید؛ برای مثال:

`/export@YourBotUsername`

با استفاده از دکمه **Open** در گروه، وارد گفت‌وگوی خصوصی ربات شوید. برای دریافت فایل‌های Excel لازم است حداقل یک بار گفت‌وگوی خصوصی با ربات را شروع کرده باشید.

## ۸. گزارش کارهای در انتظار و مسئولیت‌ها

گزارش **Pending** مراحل قابل انجام، مسدودشده یا نیازمند بازبینی را بر اساس مسئول دسته‌بندی می‌کند:

- **MTNI:** برنامه نصب توسط RND، صدور BP توسط RMPS، دریافت Core/SID/CGI/IP، تحویل تجهیزات (Material delivery) و نتیجه اشتراک‌گذاری (Sharing result).
- **پیمانکار (Contractor):** سایر مراحل گردش‌کار.

مدت Pending، بازه پیوسته فعلی را نشان می‌دهد که در آن یک مرحله قابل انجام، مسدود یا منتظر بازبینی بوده است. ممکن است یک سایت در شمارش هر دو مسئول لحاظ شود. کارت سایت و خلاصه خروجی، قدیمی‌ترین مرحله در انتظار هر مسئول را نشان می‌دهد؛ بخش Step Details مدت زمان هر مرحله را جداگانه نمایش می‌دهد.

## ۹. مدیریت دسترسی کاربران و گروه‌های تلگرام (ویژه مدیران)

۱. در بخش مدیریت، کاربران را اضافه یا ویرایش کنید و نقش و کدهای SC مجاز هر کاربر را تعیین کنید.  
۲. برای هر مشارکت‌کننده یا مشاهده‌گر، فقط مراکز خدمات مرتبط با مسئولیت او را اختصاص دهید.  
۳. در مسیر **Administration → Telegram groups and reminders**، شناسه عددی هر گروه تلگرام (Chat ID) را ثبت و کدهای SC مربوط به آن را اختصاص دهید.  
۴. برای هر گروهی که باید اطلاعات سایت‌ها را دریافت کند، حداقل یک SC تعیین کنید. گروه بدون SC عمداً از دریافت اطلاعات سایت‌ها محروم است.  
۵. دستور کاربر غیرمدیر در گروه، فقط به اشتراک محدوده SCهای مجاز کاربر و SCهای اختصاص‌یافته به گروه محدود می‌شود.  
۶. دستور مدیر در یک گروه پیکربندی‌شده، با محدوده همان گروه اجرا می‌شود؛ همان دستور در گفت‌وگوی خصوصی مدیر، تمام SCها را پوشش می‌دهد.  
۷. مدیران می‌توانند از داشبورد، آمار تجمیعی، تفکیک بر اساس تیم و SC و خروجی Excel برای همه مراکز یا هر مرکز به‌صورت جداگانه دریافت کنند.

**Region** برای گزارش‌گیری و فیلتر است؛ اما **SC** مرز اصلی کنترل دسترسی محسوب می‌شود. یک SC می‌تواند سایت‌هایی از چند منطقه مختلف داشته باشد.

## ۱۰. بستن هفته و بایگانی برنامه (ویژه مدیران)

در پایان هفته گزارش، از مسیر **Administration → Archive current plan** برنامه فعال را بایگانی کنید. این کار گردش‌کارها و سوابق ممیزی را حفظ می‌کند، اما شناسه سایت‌ها را از داشبورد فعال پاک می‌کند. با ثبت فایل هفتگی بعدی، فقط سایت‌های موجود در فایل جدید دوباره فعال می‌شوند.

## ۱۱. نکات مهم

- برای استفاده عملیاتی از مینی‌اپ و Webhook تلگرام، نشانی‌ها باید HTTPS باشند؛ HTTP معمولی پشتیبانی نمی‌شود.
- توکن ربات، رمز Webhook، اطلاعات پایگاه داده و سایر کلیدهای محرمانه را محفوظ نگه دارید. این اطلاعات را در فایل CSV یا گروه‌های تلگرام قرار ندهید.
- مدارک بارگذاری‌شده فقط به‌صورت فایل پیوست و با کنترل دسترسی قابل دریافت هستند.
- منطقه زمانی اولیه اعلان‌ها `Asia/Tehran` است و زمان رویدادها همراه با اختلاف ساعت UTC نمایش داده می‌شود.
- اگر دستوری اطلاعاتی برنگرداند، ابتدا دسترسی SC کاربر و تخصیص SC به گروه تلگرام را بررسی کنید.
- برای نصب و راه‌اندازی فنی، پشتیبان‌گیری و عیب‌یابی، به README اصلی و مستندات عملیات مراجعه کنید.
