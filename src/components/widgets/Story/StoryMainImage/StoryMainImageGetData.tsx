import {gql} from 'graphql-tag';
import {StoryMainImageParams, StoryMainImageResponse} from "./types";
import {WebsiteApiProvider} from "../../../../providers/WebsiteApiProvider";
import {ImageHelper_getImageDimensionsFromObject} from "../../../../helpers/ImageHelper";

export async function StoryMainImage_getData({widgetConfig, context}: StoryMainImageParams) {
    const query = gql`
        query($storyId: UUID){
            story(id:$storyId){
                image {
                    url
                    caption
                    preset {
                        code
                    }
                    crop {
                        height
                        width
                        x
                        y
                    }
                    image {
                        url
                        width
                        height
                        sources {
                            source {
                                name
                                link{
                                    url
                                }
                            }
                        }
                        license {
                            note
                        }
                        presets {
                            url
                            role {
                                code
                            }
                        }
                    }
                }
            }
        }
    `;

    const imageDimensions = ImageHelper_getImageDimensionsFromObject(widgetConfig, context);

    const variables = {
        storyId: context.id,
        imageWidth: imageDimensions.width,
        imageHeight: imageDimensions.height,
    };

    let response = widgetConfig?.response;
    if (!response) {
        response = await WebsiteApiProvider.call(query, variables, widgetConfig?.cacheTTL) as StoryMainImageResponse;
    }

    return response;
}

