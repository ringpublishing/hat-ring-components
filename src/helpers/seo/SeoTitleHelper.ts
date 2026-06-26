// Helpers
import {ConfigHelper_getSiteName} from "../ConfigHelper";

// Providers
import {WebsiteApiProvider} from "../../providers/WebsiteApiProvider";

// Libraries
import {gql} from "graphql-tag";
import _ from "lodash";
import {SeoHelper_getSeoCurrentPageType} from "./SeoHelper";
import {UtilsHelper_getDomain, UtilsHelper_slugify} from "../UtilsHelper";

/**
 * Helper for handling titles according to the SEO requirements based on the placement of the usage
 * TODO: (1) Add support for seo & social_media_teaser (and other custom teasers) to the WM configuration
 * TODO: (2) Possibility to support fallback names based on the node slug/path
 * @param {object} context > Current page context
 * @param {string} place > Supported place types: default | meta-title | og-title | twitter-title | schema-title
 * @constructor
 */
export async function SeoTitleHelper_pageTitle(context, place: string) {
    const defaultPageTitle = await ConfigHelper_getSiteName(context);
    const pageType = await SeoHelper_getSeoCurrentPageType(context);

    switch (pageType) {
        case 'Story':            
            return await prepareStoryTitle();

        case 'SiteNode':
            return await prepareCategoryTitle();

        case 'Homepage':
        default:
            return defaultPageTitle;
    }

    async function getStoryTitles() {
        const storyQuery = gql`
            query($storyId: UUID){
                story(id:$storyId){
                    title
                    leads {
                        title
                        role {
                            name
                            code
                        }
                    }
                }
            }
        `;

        const storyResponse = await WebsiteApiProvider.call(storyQuery, {storyId: context.id,});

        return {
            title: _.get(storyResponse, 'data.story.title', '') || '',
            leads: _.get(storyResponse, 'data.story.leads', []) || [],
        }
    }

    async function prepareStoryTitle() {
        const storyTitles = await getStoryTitles();
        const title = _.get(storyTitles, 'title', '');
        const seoTitle = _.get(_.get(storyTitles, 'leads', []).find(lead => {return lead.role.code === 'seo'}), 'title'); // TODO: (1)
        const socialMediaTitle = _.get(_.get(storyTitles, 'leads', []).find(lead => {return lead.role.code === 'social_media_teaser'}), 'title'); // TODO: (1)

        switch (place) {
            case 'default':
                return defaultPageTitle;

            case 'meta-title':
            case 'schema-title':
                if (seoTitle) {
                    return seoTitle || title || defaultPageTitle;
                }

                return title || defaultPageTitle;

            case 'og-title':
            case 'twitter-title':
                if (socialMediaTitle) {
                    return socialMediaTitle || title || defaultPageTitle;
                }

                return title || defaultPageTitle;

            default:
                return title || defaultPageTitle;
        }
    }

    async function getCategoryName() {
        const categoryNameFromContext = _.get(context, 'hatControllerParams.gqlResponse.data.site.data.node.category.data.name', '');
        if (categoryNameFromContext) return categoryNameFromContext;

        const nodeQuery = gql`
            query($url: URL!, $variant:ID!){
                site(url:$url, variantId: $variant){
                    data {
                        node {
                            slug
                            category {
                                data{
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `;

        const nodeResponse = await WebsiteApiProvider.call(nodeQuery, {
            url: UtilsHelper_getDomain(context, true) + context.url,
            variant: context.websiteManagerVariant,
        }, 60);

        const categoryName = _.get(nodeResponse, 'data.site.data.node.category.data.name', '');
        if (categoryName) return categoryName;

        const slug = _.get(nodeResponse, 'data.site.data.node.slug', '');
        return _.capitalize(UtilsHelper_slugify(slug));
    }

    async function prepareCategoryTitle() {
        const categoryName = await getCategoryName();

        switch (place) {
            case 'default':
                return defaultPageTitle;

            case 'meta-title':
                return categoryName || defaultPageTitle;

            case 'og-title':
            case 'schema-title':
            case 'twitter-title':
            default:
                return categoryName;
        }
    }
}
