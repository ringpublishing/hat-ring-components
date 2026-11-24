import React from "react"
import {AppContext, SiteContentType} from "../../../types/types"
import {SeoHelper_checkStoryHiddenFlag, StoryHelper_isPreview} from "../../../helpers/StoryHelper"
import {UtilsHelper_getCurrentPageType} from "../../../helpers/UtilsHelper";

const removeNoIndexNoFollow = (metaTags) => {
    return metaTags.filter((tag) => {
        return !(
            tag.name === "robots" &&
            (tag.content.includes("index") ||
                tag.content.includes("noindex") ||
                tag.content.includes("follow") ||
                tag.content.includes("nofollow"))
        )
    })
}

const customRobotSettings = (tags) => {
    return {
        nofollow: tags.includes("nofollow") ? true : tags.includes("follow") ? false : null,
        noindex: tags.includes("noindex") ? true : tags.includes("index") ? false : null,
    }
}

export async function SeoMetaDecoratorRobots(context: AppContext, generatedMetaTags) {
    if (!generatedMetaTags) {
        return generatedMetaTags
    }

    const customMetaRobotsTags =
        generatedMetaTags.extend?.meta?.find((tag) => tag.name === "robots")?.content?.split(",") || []

    if (customMetaRobotsTags.length > 0) {
        if (UtilsHelper_getCurrentPageType(context) === SiteContentType.Story) {
            const [isHiddenFlag, isPreview] = await Promise.all([
                SeoHelper_checkStoryHiddenFlag(context),
                StoryHelper_isPreview(context),
            ])
            if (isHiddenFlag || isPreview) {
                generatedMetaTags.nofollow = true
                generatedMetaTags.noindex = true
                generatedMetaTags.extend.meta = removeNoIndexNoFollow(generatedMetaTags.extend.meta)
                return generatedMetaTags
            }
        }

        const customSettings = customRobotSettings(customMetaRobotsTags)
        generatedMetaTags.nofollow = customSettings.nofollow ?? generatedMetaTags.nofollow
        generatedMetaTags.noindex = customSettings.noindex ?? generatedMetaTags.noindex

        generatedMetaTags.extend.meta = removeNoIndexNoFollow(generatedMetaTags.extend.meta)
    }

    return generatedMetaTags
}
