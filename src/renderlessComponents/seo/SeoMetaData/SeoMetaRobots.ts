import React from "react";
import {AppContext, SiteContentType} from "../../../types/types";
import {ConfigHelper_getMetaDataConfig} from "../../../helpers/ConfigHelper";
import {gql} from "graphql-tag";
import {WebsiteApiProvider} from "../../../providers/WebsiteApiProvider";
import { StoryHelper_getStoryFlagsAndPreview } from "../../../helpers/StoryHelper"

export async function SeoMetaRobots(context: AppContext) {
    const actualPageType = context.siteContentType;
    const robots: any = {};
    let isHiddenOrPreview = false;

    if (actualPageType === SiteContentType.Story) {
       const {flags, isPreview} = await StoryHelper_getStoryFlagsAndPreview(context)
       isHiddenOrPreview = isPreview || flags.some((flag) => flag.code === "hidden")
    }

    if (isHiddenOrPreview) {
        robots.index = false;
        robots.follow = false;
    } else {
        robots.index = true;
        robots.follow = true;
    }

    if (actualPageType === SiteContentType.Search || actualPageType === SiteContentType.Error404) {
        robots.index = false
        robots.follow = true
    }    
    return {
        nofollow: !robots.follow,
        noindex: !robots.index,
    };
}


