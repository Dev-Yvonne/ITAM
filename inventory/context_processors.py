from .version import ITAM_PRODUCT_NAME, ITAM_VERSION


def itam_version_context(request):
    return {
        "itam_version": ITAM_VERSION,
        "itam_product_name": ITAM_PRODUCT_NAME,
    }
