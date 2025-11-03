// lib/routes/minkabu/new_arrivals.js
const got = require('@/utils/got');
const cheerio = require('cheerio');
const { parseDate } = require('@/utils/parse-date');
const timezone = require('@/utils/timezone');

const SITE = 'https://minkabu.jp';
const URL = `${SITE}/news/search?category=new_arrivals`;
const TZ = 'Asia/Tokyo'; // JST

function parseJpDatetime(text) {
    // Examples seen on the page:
    // "今日 16:54"
    // "昨日 08:32"
    // "2025/11/03 16:54"
    const today = timezone(new Date(), TZ);
    const m = text.trim();

    // YYYY/MM/DD HH:mm
    const full = m.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (full) {
        const [_, y, mo, d, hh, mm] = full;
        return timezone(parseDate(`${y}-${mo}-${d} ${hh}:${mm}`, 'YYYY-M-D HH:mm'), TZ);
    }

    // 今日 HH:mm
    const kyou = m.match(/^今日\s+(\d{1,2}):(\d{2})$/);
    if (kyou) {
        const [_, hh, mm] = kyou;
        const y = today.getFullYear();
        const mo = today.getMonth() + 1;
        const d = today.getDate();
        return timezone(parseDate(`${y}-${mo}-${d} ${hh}:${mm}`, 'YYYY-M-D HH:mm'), TZ);
    }

    // 昨日 HH:mm
    const kinou = m.match(/^昨日\s+(\d{1,2}):(\d{2})$/);
    if (kinou) {
        const [_, hh, mm] = kinou;
        const y = today.getFullYear();
        const mo = today.getMonth() + 1;
        const d = today.getDate() - 1;
        return timezone(parseDate(`${y}-${mo}-${d} ${hh}:${mm}`, 'YYYY-M-D HH:mm'), TZ);
    }

    // Fallback: let parseDate try
    return timezone(parseDate(m), TZ);
}

module.exports = async (ctx) => {
    const { data } = await got(URL);
    const $ = cheerio.load(data);

    // Each list item contains one article
    const items = $('#v-news-search-ssr ul.md_list > li')
        .map((_, li) => {
            const $li = $(li);

            const a = $li.find('.title_box a').first();
            if (!a || !a.attr('href')) {
                return null;
            }

            const title = a.text().trim();
            const link = new URL(a.attr('href'), SITE).href;

            // author / source / time block appears under a flex container
            let author = undefined;
            let source = undefined;
            let timeText = undefined;

            $li.find('div.flex.flex-wrap.gap-4.text-left.text-sm > div').each((__, div) => {
                const txt = $(div).text().trim();
                if (txt.startsWith('配信元：')) {
                    source = txt.replace('配信元：', '').trim();
                } else if (txt.startsWith('著者：')) {
                    author = txt.replace('著者：', '').trim();
                } else if (/\d{1,2}:\d{2}/.test(txt) || txt.startsWith('今日') || txt.startsWith('昨日')) {
                    timeText = txt;
                }
            });

            const pubDate = timeText ? parseJpDatetime(timeText) : timezone(new Date(), TZ);

            return {
                title,
                link,
                author,
                description: [source, author].filter(Boolean).join(' / ') || undefined,
                pubDate,
            };
        })
        .get()
        .filter(Boolean);

    ctx.state.data = {
        title: 'みんかぶ新着ニュース',
        link: URL,
        language: 'ja',
        item: items,
    };
};
