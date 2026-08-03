import {UtilsHelper_convertToInt, UtilsHelper_isMobile} from "./UtilsHelper";
import {ConfigHelper_getGeneralConfig} from "./ConfigHelper";
import {AbstractWidgetConfig, AppContext} from "../types/types";
import {TransformType} from "./AcceleratorImagesHelper";
import {RingImageObject} from "../renderlessComponents/common/RingImageObject";
import {ImageFormat} from "@ringpublishing/accelerator-images";
import _ from "lodash";
import {StoryMainImageResponse, StoryMainImageWidgetConfig} from "../components/widgets/Story/StoryMainImage/types";
import {ImageBlock, MainImageReference} from "@ringpublishing/graphql-api-client-got/dist/types/websites-api";
import {WidgetHelper_getAppropriateTeaserCode, WidgetHelper_getAppropriateTeaserImage} from "./WidgetHelper";
import {BasicWidgetConfig} from "../components/widgets/common/BasicWidget/types";
import {GenericListWidgetConfig} from "../components/widgets/Lists/GenericList/types";

type ImagePresetReference = {
    url: string;
    role: {
        code: string;
    };
};

type LeadReference = {
    role?: {
        code?: string;
    };
    image?: {
        url?: string;
    };
};

type ProcessedImage = {
    url: string | undefined;
    width: number;
    height: number;
};

export async function ImageHelper_getDefaultImageData(context: AppContext, width: number, height: number, transform: TransformType = TransformType.ResizeCropAuto, format: ImageFormat[] = ['png']): Promise<ReturnType<typeof RingImageObject> | null> {

    const generalSettings = await ConfigHelper_getGeneralConfig(context);

    if (generalSettings) {
        const src = generalSettings.defaultImage;

        return RingImageObject(src, width, height, transform, format);
    }

    return null;
}

/**
 * Generate object of dimensions {width, height} from object
 * @param object: any
 * @param context
 * @param desktopFieldName
 * @param mobileFieldName
 * @param defaultSizesString
 * @return {width: SafeNumber, height: SafeNumber}
 */
export function ImageHelper_getImageDimensionsFromObject(object: Record<string, any> | null | undefined, context: AppContext, desktopFieldName = 'standardImageSize', mobileFieldName = 'imageSizeMobile', defaultSizesString = '800x450'): {
    width: number,
    height: number
} {
    if (!object) return {width: 0, height: 0};
    const isMobile = UtilsHelper_isMobile(context);
    const dimensionsString: string =
        (isMobile && object[mobileFieldName]) ||
        object[desktopFieldName] ||
        defaultSizesString;
    const sizes = dimensionsString.split('x');
    return {width: parseInt(sizes[0]), height: parseInt(sizes[1])};
}

export function ImageHelper_getImageDimensionsWithAspectRatio(width: number, height: number, maxWidth: number, maxHeight: number): {
    width: number, height: number
} {
    // Adjust height to maintain aspect ratio if max width is set and less than current width.
    if (maxWidth > 0 && maxWidth < width) {
        height = Math.round(maxWidth * height / width);
        width = maxWidth;
    }

    // Adjust width to maintain aspect ratio if max height is set and less than current height.
    if (maxHeight > 0 && maxHeight < height) {
        width = Math.round(maxHeight * width / height);
        height = maxHeight;
    }
    return {
        width, height
    }
}

type ImageCopyrightSourceItem = {
    type: 'Copyright' | 'Source'; name: string; url?: string;
}

export function ImageHelper_getImageMetaData(image: ImageBlock | MainImageReference): {
    caption: string; imageCopyrightSources: Array<ImageCopyrightSourceItem>
} {
    const imageCopyrightSources: Array<ImageCopyrightSourceItem> = [];
    const copyright = _.get(image, 'image.license.note');
    const sources = _.get(image, 'image.sources');
    // MainImageReference -> image.caption, ImageBlock -> image.title
    let caption = _.get(image, 'caption', _.get(image, 'title', ''));

    if (copyright) {
        imageCopyrightSources.push({
            type: 'Copyright', name: copyright
        });
    } else if (sources && sources.length > 0) {
        sources.forEach((source: any) => {
            const src = {
                type: 'Source', name: source.source?.name,
            } as ImageCopyrightSourceItem;
            if (source.source?.link?.url) {
                src.url = source.source?.link?.url;
            }
            imageCopyrightSources.push(src);
        });
    }

    return {
        caption, imageCopyrightSources
    };
}

export function ImageHelper_getImagePreset(image: ImageBlock | MainImageReference, presetCode: string | null): string | null {
    if (presetCode) {
        const allPresets: ImagePresetReference[] = _.get(image, 'image.presets', []);

        const selectedPreset = allPresets.find((p: ImagePresetReference) => p.role.code === presetCode);

        if (selectedPreset) {
            return selectedPreset.url;
        }
    }

    return null;
}

export async function ImageHelper_processImage({
    imageObj,
    widgetConfig,
    context,
    presetCode,
    imageSizes,
    originalImageWidth,
    originalImageHeight,
    leads = [],
    isBig = false
}: {
    presetCode: string | null,
    imageObj: ImageBlock | MainImageReference,
    widgetConfig: BasicWidgetConfig | GenericListWidgetConfig | StoryMainImageWidgetConfig,
    context: AppContext,
    imageSizes: {
        width: number,
        height: number
    },
    originalImageWidth: number,
    originalImageHeight: number,
    leads?: LeadReference[],
    isBig?: boolean
}): Promise<ProcessedImage> {
    const croppedSrc = _.get(imageObj, 'url');
    const originalSrc = _.get(imageObj, 'image.url');
    const imageResizeCropMode = _.get(widgetConfig, 'imageResizeCropMode', 'cover');
    const maxImageWidth = UtilsHelper_convertToInt(imageSizes.width);
    const maxImageHeight = UtilsHelper_convertToInt(imageSizes.height);
    let imageWidth = originalImageWidth;
    let imageHeight = originalImageHeight;
    let imgSrc = croppedSrc;

    if (widgetConfig?.useOriginalImage) {
        imgSrc = originalSrc;
    } else {
        const presetUrl = ImageHelper_getImagePreset(imageObj, presetCode);
        if (presetUrl) {
            imgSrc = presetUrl;
        } else {
            const customTeaserImageUrl = await WidgetHelper_getAppropriateTeaserImage(widgetConfig, context, leads, isBig);
            if (customTeaserImageUrl) {
                imgSrc = customTeaserImageUrl;
            }
        }
    }

    if (imageResizeCropMode === 'contain' && imageWidth !== 0 && imageHeight !== 0) {
        const calculatedDimensions = ImageHelper_getImageDimensionsWithAspectRatio(imageWidth, imageHeight, maxImageWidth, maxImageHeight);
        imageWidth = calculatedDimensions.width;
        imageHeight = calculatedDimensions.height;
    } else {
        imageWidth = maxImageWidth;
        imageHeight = maxImageHeight;
    }

    return {
        url: imgSrc, width: imageWidth, height: imageHeight,
    }
}
