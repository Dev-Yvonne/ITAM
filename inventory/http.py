import json


def parse_request_data(request) -> dict | None:
    if request.content_type.startswith("application/json") and request.body:
        try:
            return json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return None
    return request.POST.dict()
