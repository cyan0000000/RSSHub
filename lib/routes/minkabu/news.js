const got = require('@/utils/got');
const cheerio = require('cheerio');

module.exports = async (ctx) => {
    const baseUrl = 'https://minkabu.jp';
    const listUrl = `${baseUrl}/news`;

    // 获取列表页面
    const { data: listHtml } = await got(listUrl);
    const $ = cheerio.load(listHtml);

    // 选择所有以 /news/ 开头的链接，去重且保留顺序
    const hrefs = [];
    $('a[href^="/news/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && !hrefs.includes(href)) {
            hrefs.push(href);
        }
    });

    // 只取前 15 条以避免太慢（可以改）
    const links = hrefs.slice(0, 15).map((h) => `${baseUrl}${h}`);

    // 为每个链接抓取详细信息（用 ctx.cache.tryGet 做缓存）
    const items = await Promise.all(
        links.map((link) =>
            ctx.cache.tryGet(link, async () => {
                try {
                    const { data: articleHtml } = await got(link);
                    const $$ = cheerio.load(articleHtml);

                    // 优先从 meta 标签取 description
                    const description =
                        $$('meta[property="og:description"]').attr('content') ||
                        $$('meta[name="description"]').attr('content') ||
                        // 退而取文章中首段文字
                        $$('article p').first().text().trim() ||
                        $$('p').first().text().trim() ||
                        '';

                    // 取标题（优先 og:title）
                    const title =
                        $$('meta[property="og:title"]').attr('content') ||
                        $$('title').text().trim() ||
                        $$('h1').first().text().trim() ||
                        link;

                    // 尝试读取发布时间（多种策略）
                    let pubDate =
                        $$('meta[property="article:published_time"]').attr('content') ||
                        $$('meta[name="pubdate"]').attr('content') ||
                        $$('time').attr('datetime') ||
                        $$('time').first().text().trim() ||
                        null;

                    if (pubDate) {
                        // 如果是可解析的日期字符串，转为 RFC822/ISO
                        try {
                            const d = new Date(pubDate);
                            if (!isNaN(d.getTime())) {
                                pubDate = d.toUTCString();
                            }
                        } catch (e) {
                            // leave as-is
                        }
                    }

                    return {
                        title: title,
                        description: description,
                        link: link,
                        guid: link,
                        pubDate: pubDate,
                    };
                } catch (err) {
                    // 若抓取单篇失败，返回最少信息以保证 feed 可用
                    return {
                        title: link,
                        description: '',
                        link: link,
                        guid: link,
                    };
                }
            })
        )
    );

    ctx.state.data = {
        title: 'Minkabu News',
        link: listUrl,
        description: 'Latest news from minkabu.jp',
        item: items,
    };
};
