import {AppContext} from "../../../types/types";
import {
    ConfigHelper_getGeneralConfig, ConfigHelper_getSeoGeneralConfig,
    ConfigHelper_getSeoRssDefaultConfig, ConfigHelper_getSiteDescription,
    ConfigHelper_getSiteName
} from "../../../helpers/ConfigHelper";
import {WebsiteApiProvider} from "../../../providers/WebsiteApiProvider";
import _ from "lodash";
import {ImageBlock, Story, StoryEdge} from "@ringpublishing/graphql-api-client-got/lib/types/websites-api";
import {
    UtilsHelper_convertToInt, UtilsHelper_getDomain, UtilsHelper_getQueryParam,
    UtilsHelper_parsePositiveIntFromString
} from "../../../helpers/UtilsHelper";
import {RSSGqlQuery} from "./RSSGqlQuery";
import {StoryHelper_generateContentHtml, StoryHelper_getLeadBlock} from "../../../helpers/StoryHelper";
import {Feed, Item} from "feed";
import {LogHelper_warn} from "../../../helpers/LogHelper";

type BlockDecoratorFn = (params: {
    additionalData: { story?: Story };
    block: any;
    defaultProcessBlock: () => any;
}) => Promise<any>;

type FeedDecoratorFn = (feed: Feed) => Promise<void>;

export async function RSS({context, feedDecorator, blockDecorator}: { context: AppContext, feedDecorator?: FeedDecoratorFn, blockDecorator?: BlockDecoratorFn }) {
    if(!context.id) {
        LogHelper_warn('RSS: siteNodeId is not defined for url:', context.url);
        return {
            feed: null,
            type: null
        };
    }
    const seoRssConfig = await ConfigHelper_getSeoRssDefaultConfig(context);
    const generalConfig = await ConfigHelper_getGeneralConfig(context);
    const seoGeneralConfig = await ConfigHelper_getSeoGeneralConfig(context);
    const domain = UtilsHelper_getDomain(context, true)
    const page = UtilsHelper_parsePositiveIntFromString(UtilsHelper_getQueryParam('page', context)) || 1;

    const query = RSSGqlQuery;
    const categoryId = _.get(context, 'hatControllerParams.gqlResponse.data.site.data.content.category.id');
    if(!categoryId) return {feed: null, type: null};
    const limit = seoRssConfig.limit || 10;
    const offset = ((page - 1) * UtilsHelper_convertToInt(limit));
    const excludedFlags = seoRssConfig.excludedFlags ? seoRssConfig.excludedFlags.map(flag => {
        return flag.excludedFlag
    }) : null;
    const excludedCategoryIds = seoRssConfig.excludedCategoryIds && seoRssConfig.excludedCategoryIds.length > 0 ? seoRssConfig.excludedCategoryIds.map(category => {
        return category.excludedCategoryId
    }) : null;

    const variables = {
        categoryId: categoryId,
        limit: limit,
        offset,
        excludedFlags,
        excludedCategoryIds: excludedCategoryIds,
    };

    const response = await WebsiteApiProvider.call(query, variables, 60 * 10) as {
        data: {
            stories: { total: number, edges: StoryEdge[] }
        },
    };

    const edges = response?.data?.stories?.edges || [];

    const feed = new Feed({
        description: await ConfigHelper_getSiteDescription(context),
        copyright: "",
        id: domain,
        title: await ConfigHelper_getSiteName(context),
        language: generalConfig.language,
        generator: "RAS Tech",
        link: domain + context.url,
    });

    for (const edge of edges) {
        const story = edge.node as Story;
        const newStoryObj = _.cloneDeep(story);
        newStoryObj.content[0].blocks = [{
            type: "image",
            url: story.image?.url,
            title: story.image?.caption,
            image: {
                width: story.image?.crop?.width || story.image?.image?.width,
                height: story.image?.crop?.height || story.image?.image?.height,
                license: {
                    note: story.image?.image?.license?.note,
                },
                sources: story.image?.image?.sources
            }
        } as ImageBlock, ...story.content[0].blocks]

        let item: Item = {
            title: story.title,
            guid: story.mainPublicationPoint.url,
            link: story.mainPublicationPoint.url,
            date: new Date(story.date?.creationTime),
            content: await StoryHelper_generateContentHtml({story: newStoryObj, blockDecorator}),
        };

        const lead = StoryHelper_getLeadBlock(story);
        if(lead && lead.text){
            item.description = lead.text;
        }

        if (story.authors) {
            item.author = [];
            story.authors.forEach(author => {
                let email = seoGeneralConfig.defaultArticleAuthorEmail;
                author.author.socialProfiles.forEach(socialProfile => {
                    if (socialProfile.role.code === 'email') {
                        email = socialProfile.url.replace('mailto:', '')
                    }
                })
                item.author?.push({
                    name: author?.author?.name || seoGeneralConfig.defaultArticleAuthor,
                    email: email
                });
            })

        } else {
            if (seoGeneralConfig.defaultArticleAuthor && seoGeneralConfig.defaultArticleAuthorEmail) {
                item.author = [{
                    name: seoGeneralConfig.defaultArticleAuthor,
                    email: seoGeneralConfig.defaultArticleAuthorEmail
                }]
            }
        }

        feed.addItem(item);
    }

    if (feedDecorator) {
        await feedDecorator(feed);
    }

    switch (seoRssConfig.rssType) {
        case 'RSS Atom 1.0 feed':
            return {feed: feed.atom1(), type: seoRssConfig.rssType};
        case 'RSS 2.0 feed':
            return {feed: feed.rss2(), type: seoRssConfig.rssType};
        default:
            return {feed: feed.rss2(), type: seoRssConfig.rssType};
    }
}


