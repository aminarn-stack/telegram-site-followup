# User Guide — راهنمای کاربران

This guide is for people using the Telegram Site Follow-up bot and Mini App. It does not cover administration, setup, or deployment.

این راهنما فقط برای کاربران سامانه است و روش استفاده از ربات تلگرام و مینی‌اپ را توضیح می‌دهد؛ شامل آموزش مدیریت، نصب یا راه‌اندازی نیست.

---

# English

## 1. Start the bot and open the app

1. Open the Telegram bot in a private chat and press **Start**, or send `/start`.
2. Send `/open` or tap **Open App** to launch the Mini App.
3. Sign in with your Telegram account.
4. Your available sites and reports are based on the access assigned to your account. If you cannot see a site you need, contact your team administrator.

## 2. Find a site

1. Open the site list or dashboard.
2. Search by **Site ID**, or use the available filters (week, Region, SC, site type, status, or assignee).
3. Select a site to view its workflow, step statuses, comments, evidence, blockers, and history.

## 3. Update a workflow step

1. Open the site and find the next available step.
2. Complete the work required for that step.
3. Choose the appropriate answer/status shown in the app.
4. Add a clear comment when requested. If work is blocked, explain what is preventing progress and what is needed next.
5. Attach supporting evidence when requested or useful. Supported formats: **JPEG, PNG, WebP, and PDF**.
6. Save the update. Continue with the next step when it becomes available.

A locked step is waiting for a prerequisite. Complete the earlier required step or contact your team administrator if the workflow appears incorrect. Do not try to bypass locked steps.

## 4. BP issuance milestone

When you reach **BP issuance by RMPS**, use **Done - All previous steps considered as Done** or **Set BP milestone** only when the responsible team has confirmed that the earlier steps can be treated as complete. This milestone may close the applicable earlier steps and unlock the next part of the workflow. Existing comments and evidence remain in the history.

If you are unsure whether this milestone should be set, check with your team lead before proceeding.

## 5. License required

After BP issuance, answer **License required**:
- Choose **Yes** if a license is required. The **License issuance** step will then be available; update it as **Done** or **Not Done**.
- Choose **Requested - No** if a license is not required for the site.

## 6. Telegram bot commands

Send these commands to the bot:

| Command | What it does |
| --- | --- |
| `/start` | Start the bot and show the app entry point. |
| `/open` | Show the button to open the Mini App. |
| `/guide` | Get this user guide. |
| `/summary` | View a summary of sites in your permitted scope. |
| `/remind` | Request a reminder summary for pending work. |
| `/export` | Receive an Excel report of sites and step statuses. |
| `/flowexport` | Receive an Excel report organized by SC, Region, and Site ID, including current and next steps. |
| `/pending` | Receive an Excel report of pending steps grouped by owner. |
| `/help` | View a short list of bot commands. |

In a Telegram group with privacy mode enabled, address a command to the bot, for example `/summary@YourBotUsername`. To receive Excel reports, open the bot in a private chat and press **Start** at least once.

Reports only include information your account is allowed to access. In groups, the report is also limited to that group's assigned scope.

## 7. Understand pending work

The `/pending` report groups outstanding work by owner:
- **MTNI:** Installation plan by RND, BP issuance by RMPS, Core/SID/CGI/IP receipt, Material delivery, and Sharing result.
- **Contractor:** Other workflow steps.

A site can appear under both owners if it has pending steps assigned to each. Use the site details to review each step, its current status, and how long it has been pending.

## 8. Helpful tips

- Keep comments specific: describe the result, blocker, responsible party, and next action.
- Upload clear, relevant evidence and make sure it belongs to the correct site and step.
- If a step is locked, check its prerequisites rather than trying to skip it.
- If you cannot see a site or receive a report, contact your team administrator to check your access.
- Bot notifications show event times in the configured timezone.

---

# فارسی

## ۱. شروع کار و ورود به مینی‌اپ

۱. ربات تلگرام را در گفت‌وگوی خصوصی باز کنید و روی **Start** بزنید یا دستور `/start` را ارسال کنید.  
۲. دستور `/open` را بفرستید یا روی دکمه **Open App** بزنید تا مینی‌اپ باز شود.  
۳. با حساب تلگرام خود وارد شوید.  
۴. فهرست سایت‌ها و گزارش‌هایی که مشاهده می‌کنید، بر اساس سطح دسترسی حساب شماست. اگر سایت موردنیازتان را نمی‌بینید، با مدیر تیم خود تماس بگیرید.

## ۲. پیدا کردن سایت

۱. فهرست سایت‌ها یا داشبورد را باز کنید.  
۲. با **Site ID** جست‌وجو کنید یا از فیلترهای موجود مانند هفته، منطقه (Region)، مرکز خدمات (SC)، نوع سایت، وضعیت یا مسئول استفاده کنید.  
۳. سایت موردنظر را انتخاب کنید تا گردش‌کار، وضعیت مراحل، توضیحات، مدارک، موانع و سوابق آن را ببینید.

## ۳. به‌روزرسانی یک مرحله

۱. سایت را باز کنید و اولین مرحله‌ای را که قابل انجام است پیدا کنید.  
۲. فعالیت موردنیاز آن مرحله را انجام دهید.  
۳. پاسخ یا وضعیت مناسب را از گزینه‌های نمایش‌داده‌شده در برنامه انتخاب کنید.  
۴. در صورت درخواست سامانه، توضیحی روشن و دقیق بنویسید. اگر کار متوقف شده است، علت توقف و اقدام موردنیاز بعدی را شرح دهید.  
۵. در صورت نیاز، مدرک مرتبط بارگذاری کنید. فرمت‌های قابل قبول **JPEG، PNG، WebP و PDF** هستند.  
۶. تغییرات را ذخیره کنید و پس از باز شدن مرحله بعدی، ادامه دهید.

مرحله قفل‌شده یعنی یکی از پیش‌نیازهای آن هنوز تکمیل نشده است. ابتدا مراحل قبلی را تکمیل کنید. اگر به نظر می‌رسد گردش‌کار اشتباه است، با مدیر تیم تماس بگیرید. برای عبور از مراحل قفل‌شده تلاش نکنید.

## ۴. نقطه عطف BP issuance

هنگام رسیدن به مرحله **BP issuance by RMPS**، گزینه **Done - All previous steps considered as Done** یا **Set BP milestone** را فقط زمانی انتخاب کنید که تیم مسئول تأیید کرده باشد مراحل قبلی می‌توانند تکمیل‌شده در نظر گرفته شوند. ثبت این نقطه عطف ممکن است مراحل قبلیِ مشمول را ببندد و مراحل بعدی را فعال کند. توضیحات و مدارک قبلی در سوابق باقی می‌مانند.

اگر مطمئن نیستید که باید این نقطه عطف را ثبت کنید، پیش از اقدام با سرپرست تیم هماهنگ کنید.

## ۵. پاسخ به License required

پس از BP issuance، به مرحله **License required** پاسخ دهید:

- اگر مجوز لازم است، گزینه **Yes** را انتخاب کنید. سپس مرحله **License issuance** فعال می‌شود و باید وضعیت آن را **Done** یا **Not Done** ثبت کنید.
- اگر مجوز برای سایت لازم نیست، گزینه **Requested - No** را انتخاب کنید.

## ۶. دستورات ربات تلگرام

دستورات زیر را برای ربات ارسال کنید:

| دستور | کاربرد |
| --- | --- |
| `/start` | شروع کار با ربات و نمایش مسیر ورود به برنامه |
| `/open` | نمایش دکمه ورود به مینی‌اپ |
| `/guide` | دریافت همین راهنمای کاربران |
| `/summary` | دریافت خلاصه سایت‌های موجود در محدوده دسترسی شما |
| `/remind` | درخواست خلاصه یادآوری کارهای در انتظار |
| `/export` | دریافت فایل Excel سایت‌ها و وضعیت مراحل |
| `/flowexport` | دریافت فایل Excel بر اساس SC، منطقه و شناسه سایت، همراه با مراحل فعلی و بعدی |
| `/pending` | دریافت فایل Excel کارهای در انتظار به تفکیک مسئول |
| `/help` | مشاهده فهرست کوتاه دستورات ربات |

در گروه‌هایی که Privacy Mode تلگرام فعال است، دستور را همراه با نام کاربری ربات ارسال کنید؛ برای مثال `/summary@YourBotUsername`. برای دریافت فایل‌های Excel، حداقل یک بار ربات را در گفت‌وگوی خصوصی باز کنید و **Start** را بزنید.

گزارش‌ها فقط اطلاعاتی را نمایش می‌دهند که حساب شما مجاز به مشاهده آن است. در گروه‌ها، محدوده گزارش به دسترسی تعریف‌شده برای همان گروه نیز محدود می‌شود.

## ۷. مشاهده کارهای در انتظار

گزارش `/pending` کارهای باقی‌مانده را بر اساس مسئول دسته‌بندی می‌کند:

- **MTNI:** برنامه نصب توسط RND، صدور BP توسط RMPS، دریافت Core/SID/CGI/IP، تحویل تجهیزات (Material delivery) و نتیجه اشتراک‌گذاری (Sharing result).
- **پیمانکار (Contractor):** سایر مراحل گردش‌کار.

اگر یک سایت برای هر دو مسئول مرحله در انتظار داشته باشد، ممکن است در گزارش هر دو گروه نمایش داده شود. برای مشاهده وضعیت هر مرحله و مدت زمان انتظار، جزئیات همان سایت را باز کنید.

## ۸. نکات کاربردی

- توضیحات را دقیق بنویسید: نتیجه کار، مانع، مسئول و اقدام بعدی را مشخص کنید.
- مدارک واضح و مرتبط بارگذاری کنید و مطمئن شوید به سایت و مرحله درست تعلق دارند.
- اگر مرحله‌ای قفل است، پیش‌نیازهای آن را بررسی کنید و از رد کردن مرحله خودداری کنید.
- اگر سایت یا گزارشی را مشاهده نمی‌کنید، برای بررسی سطح دسترسی با مدیر تیم تماس بگیرید.
- زمان اعلان‌های ربات بر اساس منطقه زمانی تنظیم‌شده سامانه نمایش داده می‌شود.
