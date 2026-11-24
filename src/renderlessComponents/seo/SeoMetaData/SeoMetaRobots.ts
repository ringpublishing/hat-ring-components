import React from "react";
import {AppContext, SiteContentType} from "../../../types/types";
import {ConfigHelper_getMetaDataConfig} from "../../../helpers/ConfigHelper";
import {gql} from "graphql-tag";
import {WebsiteApiProvider} from "../../../providers/WebsiteApiProvider";
import { SeoHelper_checkStoryHiddenFlag, StoryHelper_isPreview } from "../../../helpers/StoryHelper"

export async function SeoMetaRobots(context: AppContext) {
    const actualPageType = context.siteContentType;
    const robots: any = {};
    let isHiddenFlag = false;
    let isPreview = false;

    if (actualPageType === SiteContentType.Story) {
       [isHiddenFlag, isPreview] = await Promise.all([
           SeoHelper_checkStoryHiddenFlag(context),
           StoryHelper_isPreview(context),
       ])
    }

    if (isHiddenFlag || isPreview) {
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


