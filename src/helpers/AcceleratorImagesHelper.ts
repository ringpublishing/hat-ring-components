import {AcceleratorImage, ImageFormat} from '@ringpublishing/accelerator-images';
import {LogHelper_debug} from './LogHelper';

export enum TransformType {
    ResizeCropAuto = 'resizeCropAuto',
    Resize = 'resize',
    None = 'none'
}

export function AcceleratorImagesHelper_getUrl(src: string | any, width: number | any, height: number | any, transformType: TransformType | undefined, format: ImageFormat = 'original') {
    // Runtime environment (k8s, dotenv) first, then the value Vite inlined from .env at build time (the only source a
    // plain `astro dev` without dotenv has). Astro >= 6 inlines import.meta.env at build time, so reading it first
    // would freeze the CI build-arg values into the bundle (same order as RedisProvider._readLocalUrl).
    let viteAccImagesEndpoint: string | undefined;
    let viteAccImagesTransformationKey: string | undefined;
    try {
        // @ts-ignore import.meta.env is provided by Vite/Astro
        viteAccImagesEndpoint = import.meta.env.NEXT_PUBLIC_ACC_IMAGES_ENDPOINT;
        // @ts-ignore
        viteAccImagesTransformationKey = import.meta.env.NEXT_PUBLIC_ACC_IMAGES_TRANSFORMATION_KEY;
    } catch {
        // not bundled by Vite (plain node): import.meta.env does not exist there
    }
    const accImagesEndpoint = process.env.NEXT_PUBLIC_ACC_IMAGES_ENDPOINT || viteAccImagesEndpoint;
    const accImagesTransformationKey = process.env.NEXT_PUBLIC_ACC_IMAGES_TRANSFORMATION_KEY || viteAccImagesTransformationKey;

    var srcToReturn = src;
    width = Math.floor(width);
    height = Math.floor(height);
    if (accImagesEndpoint && accImagesTransformationKey) {
        try {

            const image = new AcceleratorImage({
                originalImageUrl: src,
                transformationKey: accImagesTransformationKey,
                transformationHost: accImagesEndpoint
            })
                .imageQuality('auto');

            if (transformType === TransformType.Resize) {
                image.resize(width, height);
            } else {
                image.resizeCropAuto(width, height);
            }

            if(format !== 'original') {
                image.imageFormat(format);
            }

            srcToReturn = image.getUrl();
        } catch (e) {
            LogHelper_debug('Unable to transform image ' + src);
        }
    }

    return srcToReturn;
}
