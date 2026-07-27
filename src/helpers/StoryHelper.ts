import {ContentBlock, Story} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";
import * as convert from "xml-js";
import _ from "lodash";
import {UtilsHelper_ensureHttps} from "./UtilsHelper";
import { WebsiteApiProvider } from "../providers/WebsiteApiProvider";
import { gql } from "@ringpublishing/graphql-api-client-got";
import { AppContext } from "../types/types";
import {ImageHelper_getImageMetaData} from "./ImageHelper";
import {LogHelper_debug} from "./LogHelper";

export async function StoryHelper_generateContentHtml({story, blockDecorator}: {story: Story, blockDecorator?: Function}): Promise<string> {
    let base: any = {}
    base.elements = [];
    for (const block of story.content[0].blocks) {
        const processedBlock = blockDecorator ? await blockDecorator({
            additionalData: {story: story},
            block,
            defaultProcessBlock: () => processBlock(block),
        }) : processBlock(block);

        if (processedBlock) {
            base.elements.push(processedBlock);
        }
    }

    return convert.js2xml(base, {compact: false, ignoreComment: true, spaces: 4,  textFn(text) {
        return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    },});
}

function processBlock(block: ContentBlock) {
    switch (block.type) {
        case "heading":
            return {
                name: `h${block.level}`, type: "element", elements: [{
                    type: "text",
                    text: block.text
                }]
            }
        case "paragraph":
            return {
                name: "p", type: "element", elements:
                    [{
                        type: "text",
                        text: block.text
                    }]
            }
        case "image":
            const width = _.get(block, "image.width");
            const height = _.get(block, "image.height");
            const imageMetaData = ImageHelper_getImageMetaData(block);
            let figureElements: any[] = [{
                name: "img",
                type: "element",
                attributes: {src: block.url, alt: imageMetaData.caption, width, height}
            }];
            if (imageMetaData.caption || imageMetaData.imageCopyrightSources.length > 0) {
                const figcaption = {
                    name: "figcaption", type: "element", elements: [] as any
                }

                if (imageMetaData.caption) {
                    figcaption.elements.push({
                        name: "span",
                        type: "element",
                        attributes: {class: 'caption'},
                        elements: [{
                            type: "text",
                            text: imageMetaData.caption
                        }]
                    })
                }

                if (imageMetaData.imageCopyrightSources.length > 0) {
                    figcaption.elements.push({
                        name: "span",
                        type: "element",
                        attributes: {class: 'copyright'},
                        elements: [{
                            type: "text",
                            text: imageMetaData.imageCopyrightSources.map((credit: any) => {
                                return credit.url ?
                                    `<a href=${credit.url}>${credit.name}</a>` :
                                    `${credit.name}`
                            }).join(', ')
                        }]
                    })
                }

                figureElements.push(figcaption)
            }

            return {name: "figure", type: "element", elements: figureElements};
        case "unorderedList":
        case "orderedList":
            let liElements: any[] = [];
            block.entries.forEach(entry => {
                liElements.push({
                    name: "li", type: "element", elements: [{type: "text", text: entry}]
                })
            })
            return {
                name: block.type == "unorderedList" ? "ul" : "ol", type: "element", elements: liElements
            }
        case "preformatted":
            return {
                name: "pre", type: "element", elements:
                    [{
                        type: "text",
                        text: block.text
                    }]
            }
        case "embedded_application":
            if (!block.embed?.url) {
                return false;
            }
            const isDifferentHeight = ['Twitter', 'Instagram', 'postfacebook'].includes(block.embed?.params?.provider);
            return {
                    name: "figure",
                    type: "element",
                    attributes: {className: 'op-interactive', align: 'center',},
                    elements:
                        [{
                            name: 'iframe',
                            type: "element",
                            attributes: {
                                className: 'no-margin',
                                width: '560',
                                height: isDifferentHeight ? '450' : '315',
                                frameborder: '0',
                                src: UtilsHelper_ensureHttps(block.embed?.url),
                            },
                        }]
                }
        case "table":
            let tableElements: any[] = [];
            if (block.rows) {
                block.rows.forEach(row => {
                    let rowElement = {
                        name: "tr",
                        type: "element",
                        elements: [] as any[],
                    }
                    row.cells.forEach(cell => {
                        rowElement.elements.push({
                            name: cell.isHeader ? "th" : "td",
                            type: "element",
                            attributes: {
                                rowspan: cell.rowspan ? cell.rowspan : 1
                            },
                            elements: [{type: "text", text: cell.text}],
                        });
                    });
                    tableElements.push(rowElement);
                })
            }

            return {type: "element", elements: tableElements, name: "table"}
        default:
            LogHelper_debug(`${block.type} not supported`);
            return false;
    }
}

export function StoryHelper_getLeadBlock(story: Story): any {
    return _.get(story, 'content.0.blocks.0', null);
}

export function StoryHelper_getGqlContentFragment(): any {
    return `content {
                blocks {
                    __typename
                    ... on ImageBlock {
                        type
                        title
                        url
                        alt
                        link {
                            url
                        }
                        image {
                            title
                            width
                            height
                            sources {
                                source {
                                    name
                                    link {
                                        url
                                    }
                                }
                            }
                            license {
                                note
                            }
                        }
                        alignment
                    }
                    ... on ParagraphBlock {
                        type
                        text
                    }
                    ... on HeadingBlock {
                        type
                        level
                        text
                    }
                    ... on UnorderedListBlock {
                        type
                        styleType
                        entries
                        indentLevel
                    }
                    ... on OrderedListBlock {
                        type
                        styleType
                        entries
                        indentLevel
                        startValue
                    }
                    ... on EmbedBlock {
                        type
                        embed {
                            id
                            params
                            html
                            kind {
                                code
                               
                                    
                                }
                            }
                    }
                    ... on TableBlock {
                        type
                        rows {
                            cells {
                                alignment
                                classes
                                colspan
                                isHeader
                                link {
                                    url
                                }
                                rowspan
                                text
                            }
                        }
                    }
                    ... on GroupBlock {
                        name
                        type
                        alignment
                    }
                    ... on PreformattedBlock {
                        text
                        type
                    }
                     ... on SlotBlock{
                        type
                        data
                        kind{
                            code
                        }
                     }
                     ...on StoriesBlock{
                       type
                      kind{
                        code
                      }
                      stories{
                        story{
                          id
                        }
                      }
                    }
                }
            }`;
}

export function StoryHelper_getGroupContent(storyContentBlocks, groupType: string): any {
    let blocks: any = [];
    let started = false;
    storyContentBlocks.forEach(block => {
        if (block.name === groupType && block.type ==='groupEnd'){
            started = false;
            return false;
        }
        if (started) {
            blocks.push(block);
        }
        if (block.name === groupType && block.type ==='groupStart'){
            started = true;
        }
    });

    return blocks;

}
export async function SeoHelper_checkStoryHiddenFlag(context) {
    const query = gql`
        query ($storyId: UUID) {
            story(id: $storyId) {
                flags {
                    code
                }
            }
        }
    `

    const variables = {
        storyId: context.id,
    }
    const response = await WebsiteApiProvider.call(query, variables)

    let isHiddenFlag =
        response?.data?.story?.flags?.some((flag: {code: string}) => {
            return flag.code === "hidden"
        }) || false
    return isHiddenFlag
}

export async function StoryHelper_getStoryFlags(context: AppContext): Promise<{ code: string }[]> {
    const query = gql`
        query ($storyId: UUID) {
            story(id: $storyId) {
                flags {
                    code
                }
            }
        }
    `;
    const variables = {
        storyId: context?.id,
    };
    if(!variables.storyId) {
        return [];
    }
    const response = await WebsiteApiProvider.call(query, variables)

    return response?.data?.story?.flags || [];
}
