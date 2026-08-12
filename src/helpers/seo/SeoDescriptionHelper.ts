// Helpers
import {ConfigHelper_getSiteDescription} from "../ConfigHelper";
import {StoryHelper_getLeadBlock} from "../StoryHelper";

// Providers
import {WebsiteApiProvider} from "../../providers/WebsiteApiProvider";

// Libraries
import {Story} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";
import {gql} from "graphql-tag";
import _ from "lodash";
import {SeoHelper_getSeoCurrentPageType} from "./SeoHelper";

/**
 * Helper for handling descriptions according to the SEO requirements based on the placement of the usage
 * TODO: (1) Possibility to support fallback names based on the node slug/path
 * TODO: (2) Use 'fragment LeadFragment on Story' in gql query instead of cull content
 * TODO: (3) Add support for seo & social_media_teaser (and other custom teasers) to the WM configuration
 * TODO: (4) Add support for published categories (description from blocks)
 * @param {object} context > Current page context
 * @param {string} place > Supported place types: default | meta-description | og-description | twitter-description | schema-description
 * @constructor
 */
export async function SeoDescriptionHelper_pageDescription(context, place: string) {
    const defaultPageDescription = await ConfigHelper_getSiteDescription(context);
    const pageType = await SeoHelper_getSeoCurrentPageType(context);

    switch (pageType) {
        case 'Story':
            return prepareStoryDescription();

        case 'SiteNode':
            return prepareCategoryDescription();

        case 'Homepage':
        default:
            return defaultPageDescription;
    }

    async function getStoryDescriptions() {
        const storyQuery = gql`
            query($storyId: UUID){
                story(id:$storyId){
                    content{
                        blocks {
                            ...on ParagraphBlock{
                                text
                            }
                        }
                    }
                    leads {
                        text
                        role {
                            name
                        }
                    }
                }
            }
        `;

        const storyResponse = await WebsiteApiProvider.call(storyQuery, {storyId: context.id,});


        return {
            // @ts-ignore
            description: _.get(StoryHelper_getLeadBlock(storyResponse.data.story as Story), 'text', '') || '',
            leads: _.get(storyResponse, 'data.story.leads', []) || [],
        }
    }

    async function prepareStoryDescription() {
        const storyDescriptions = await getStoryDescriptions();
        const description = _.get(storyDescriptions, 'description', '');
        const seoDescription = _.get(_.get(storyDescriptions, 'leads', []).find(lead => {return lead.role.name === 'seo'}), 'text'); // TODO: (3)
        const socialMediaDescription = _.get(_.get(storyDescriptions, 'leads', []).find(lead => {return lead.role.name === 'social_media_teaser'}), 'text'); // TODO: (3)

        switch (place) {
            case 'default':
                return defaultPageDescription;

            case 'meta-description':
            case 'schema-description':
                if (seoDescription) {
                    return seoDescription || description || defaultPageDescription;
                }

                if (description) {
                    return description || defaultPageDescription;
                }

                return defaultPageDescription;

            case 'og-description':
            case 'twitter-description':
                if (socialMediaDescription) {
                    return socialMediaDescription || description || defaultPageDescription;
                }

                if (description) {
                    return description || defaultPageDescription;
                }

                return defaultPageDescription;

            default:
                if (description) {
                    return description || defaultPageDescription;
                }

                return defaultPageDescription;
        }
    }

    async function getCategoryDescription() {
        // const nodeQuery = gql`
        //     query($url: URL!, $variant:ID!){
        //         site(url:$url, variantId: $variant){
        //             data {
        //                 node {
        //                     category {
        //                         data{
        //                             description {
        //                                 content {
        //                                     blocks {
        //                                         type
        //                                     }
        //                                 }
        //                             }
        //                         }
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // `;
        //
        // const nodeResponse = await WebsiteApiProvider.call(nodeQuery, {
        //     url: process.env.NEXT_PUBLIC_WEBSITE_DOMAIN + context.url,
        //     variant: context.websiteManagerVariant,
        // });
        //
        // const categoryBlocks = get(nodeResponse, 'data.site.data.node.category.data.description.content', []);

        // TODO: Add support for category pages (content from published category)
        return '';
    }

    async function prepareCategoryDescription() {
        const categoryDescription = await getCategoryDescription();

        switch (place) {
            case 'default':
                return defaultPageDescription;

            case 'meta-title':
                return categoryDescription;

            case 'og-title':
            case 'schema-title':
            case 'twitter-title':
            default:
                return defaultPageDescription;
        }
    }
}
