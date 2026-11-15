import base64
import binascii
import concurrent.futures
import http.client
import io
import ipaddress
import re
import socket
import ssl
import time
from datetime import date
from html.parser import HTMLParser
from threading import Lock
from urllib.parse import urljoin, urlsplit

MAX_BYTES = 4 * 1024 * 1024
MAX_TEXT = 70_000
TUM_EXAMS_URL = (
    "https://www.cit.tum.de/cit/studium/studierende/"
    "pruefungsangelegenheiten-module/elektrotechnik-informationstechnik/"
)

TUM_EI_PROGRAMME_URL = (
    "https://www.cit.tum.de/cit/studium/studiengaenge/"
    "bachelor-elektrotechnik-informationstechnik/studieninhalte/"
)
CATALOGUE_TTL = 24 * 60 * 60
_catalogue_cache = None
_catalogue_lock = Lock()

MONTHS = (
    "januar februar märz april mai juni juli august september oktober november dezember"
).split()
DATE = re.compile(r"\b(\d{1,2})\.\s*(\d{1,2}|[A-Za-zÄÖÜäöüß]+)\.?\s*(20\d{2})\b")
TIME = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
MODULE_CODE = r"[A-Z]{2,6}[- ]?\d{3,8}[A-Z]?(?:_\d{1,3})?"
CODE = re.compile(rf"\b{MODULE_CODE}\b")
CREDITS = re.compile(r"\b(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:ECTS(?:[- ](?:Punkte|Credits))?|Credits?|LP)\b", re.I)
TERM = re.compile(r"\b(Wintersemester|Sommersemester|WS|SS|SoSe|WiSe)\s*(20\d{2})(?:\s*[/–-]\s*(20\d{2}|\d{2}))?", re.I)
RET = re.compile(r"Wiederholungs(?:klausur|prüfung|pruefung)|\bretakes?\b", re.I)
FIRST = re.compile(r"Abschlussklausur|Erstversuch|Erstprüfung|\bfirst sitting\b", re.I)


class SourceError(ValueError):
    pass


class SourceHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.links = []
        self.hidden = 0
        self.anchor = None
        self.anchor_text = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.hidden += 1
        if self.hidden:
            return
        if tag in ("tr", "p", "div", "li", "section", "h1", "h2", "h3", "h4", "br"):
            self.parts.append("\n")
        if tag in ("td", "th"):
            self.parts.append("  ")
        if tag == "a":
            self.anchor = dict(attrs).get("href")
            self.anchor_text = []

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.hidden = max(0, self.hidden - 1)
        if self.hidden:
            return
        if tag in ("tr", "p", "div", "li", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")
        if tag == "a" and self.anchor:
            self.links.append((self.anchor, " ".join(self.anchor_text)))
            self.anchor = None

    def handle_data(self, text):
        if self.hidden:
            return
        compact = " ".join(text.split())
        if compact:
            self.parts.append(" " + compact)
        if self.anchor:
            self.anchor_text.append(compact)

    def text(self):
        return "\n".join(line.strip() for line in "".join(self.parts).splitlines() if line.strip())


def public_address(host):
    try:
        addresses = [
            ipaddress.ip_address(record[4][0])
            for record in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        ]
    except (OSError, ValueError) as exc:
        raise SourceError("source_unreadable") from exc
    if not addresses or any(not (address.ipv4_mapped or address).is_global
                            or address.is_multicast
                            for address in addresses if isinstance(address, ipaddress.IPv6Address)):
        raise SourceError("source_unreadable")
    if any(not address.is_global or address.is_multicast for address in addresses):
        raise SourceError("source_unreadable")
    return str(min(addresses, key=lambda address: address.version))


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, port=443, timeout=8, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        connection = socket.create_connection((self.address, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(connection, server_hostname=self.host)
        except BaseException:
            connection.close()
            raise


def fetch_public(url, *, tum_only=False):
    deadline = time.monotonic() + 16
    for _ in range(5):
        try:
            parts = urlsplit(url)
            if (
                len(url) > 2000 or parts.scheme != "https" or not parts.hostname
                or parts.username is not None or parts.password is not None
                or parts.port not in (None, 443)
            ):
                raise SourceError("source_unreadable")
            host = parts.hostname.encode("idna").decode("ascii").rstrip(".")
            if tum_only and host not in ("www.cit.tum.de", "cit.tum.de"):
                raise SourceError("source_unreadable")
            conn = PinnedHTTPSConnection(host, public_address(host))
            try:
                path = parts.path or "/"
                if parts.query:
                    path += "?" + parts.query
                conn.request("GET", path, headers={"Accept": "application/pdf,text/html,text/plain"})
                response = conn.getresponse()
                if response.status in (301, 302, 303, 307, 308) and response.getheader("Location"):
                    url = urljoin(url, response.getheader("Location"))
                    continue
                if response.status != 200:
                    raise SourceError("source_unreadable")
                content_type = response.headers.get_content_type()
                if content_type not in ("application/pdf", "application/octet-stream", "text/html", "text/plain"):
                    raise SourceError("source_unreadable")
                chunks = []
                size = 0
                while True:
                    if time.monotonic() >= deadline:
                        raise SourceError("source_unreadable")
                    chunk = response.read1(32 * 1024)
                    if not chunk:
                        return b"".join(chunks), content_type, url
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise SourceError("source_too_large")
                    chunks.append(chunk)
            finally:
                conn.close()
        except SourceError:
            raise
        except (OSError, UnicodeError, ValueError, http.client.HTTPException) as exc:
            raise SourceError("source_unreadable") from exc
    raise SourceError("source_unreadable")


def pdf_text(contents):
    if not contents.startswith(b"%PDF-"):
        raise SourceError("source_unreadable")
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(contents))
        if reader.is_encrypted:
            raise SourceError("source_unreadable")
        pages = []
        text_length = 0
        for page in reader.pages[:40]:
            stream = page.get_contents()
            if stream and len(stream.get_data()) > 5 * MAX_BYTES:
                raise SourceError("source_too_large")
            text = page.extract_text(extraction_mode="layout", layout_mode_space_vertically=False) or ""
            pages.append(text)
            text_length += len(text)
            if text_length >= MAX_TEXT:
                break
        return "\n".join(pages)[:MAX_TEXT]
    except SourceError:
        raise
    except Exception as exc:
        raise SourceError("source_unreadable") from exc


def get_term(text):
    term = TERM.search(text)
    if not term:
        return ""
    season, year, second_year = term.groups()
    if season.lower() in ("wintersemester", "ws", "wise"):
        return "WS " + year + "/" + (second_year or str(int(year) + 1))[-2:]
    return "SS " + year


def exam_location(columns):
    if not columns:
        return ""
    # Elective tables may attach a programme assignment to the room cell.
    return re.split(r"(?:BSEI|MSEI|MSCE|MSMCD)(?=[\dA-Z, ]|$)", columns[0], maxsplit=1)[0].strip(" ,;")


def room_fragment(line, column):
    if DATE.search(line) or re.search(r"Hörsäle|Zuordnung|\bMin\.", line):
        return ""
    fragments = re.split(r"\s{3,}", line.strip())
    fragment = fragments[-1]
    return fragment if fragment and line.rfind(fragment) >= max(45, column * 0.82) else ""


def wrapped_room(lines, index, location):
    if not location:
        return ""
    line = lines[index]
    column = line.rfind(location)
    if column < 60:
        return location.rstrip(" ,;")
    before = room_fragment(lines[index - 1], column) if index else ""
    if before and re.search(r"\b(?:GAR|MUC)\s*-", before) and re.match(r"HS\d|N\s+\d|Interims", location, re.I):
        location = before + " " + location
    next_index = index + 1
    while next_index < len(lines):
        fragment = room_fragment(lines[next_index], column)
        open_ending = re.search(r"[,;/-]\s*$|\b(?:Nord|im|MI|HS\d|[0-9]{2})\s*$", location)
        if not fragment or not open_ending:
            break
        location += " " + fragment
        next_index += 1
    return location.rstrip(" ,;")


def exam_rows(text, source, default_kind="exam"):
    rows = []
    kind = default_kind
    lines = text.splitlines()
    for index, line in enumerate(lines):
        date_match = DATE.search(line)
        if not date_match:
            if RET.search(line):
                kind = "retake"
            elif FIRST.search(line):
                kind = "first"
            continue
        day, month, year = date_match.groups()
        before = line[:date_match.start()]
        after = line[date_match.end():]
        left_code = CODE.match(before.lstrip())
        right_code = CODE.search(after) if not left_code else None
        code = left_code or right_code
        if not code:
            if RET.search(line):
                kind = "retake"
            elif FIRST.search(line):
                kind = "first"
            continue
        try:
            month_number = int(month) if month.isdigit() else MONTHS.index(month.lower().replace("maerz", "märz")) + 1
            exam_date = date(int(year), month_number, int(day)).isoformat()
        except ValueError:
            continue

        if left_code:
            title = before.lstrip()[left_code.end():].strip()
            name = re.split(r"\s{2,}", title, maxsplit=1)[0]
            time_match = TIME.search(after)
            fields = re.split(r"\s{2,}", after[time_match.end():].strip()) if time_match else []
            location = exam_location(fields[2:])
        else:
            time_match = TIME.search(after[:right_code.start()])
            fields = re.split(r"\s{2,}", after[right_code.end():].strip())
            name = fields[0]
            duration_at = next((index for index, field in enumerate(fields[1:], 1) if field.isdigit()), len(fields))
            location = wrapped_room(lines, index, fields[duration_at + 1]) if duration_at + 1 < len(fields) else ""

        start = f"{int(time_match[1]):02d}:{time_match[2]}" if time_match else ""
        rows.append({
            "code": re.sub(r"\s+", "", code[0]),
            "name": name,
            "date": exam_date,
            "time": start,
            "kind": kind,
            "location": location,
            "source": source,
        })
    return rows


def load_tum_document(url, title):
    contents, _, final_url = fetch_public(url, tum_only=True)
    text = pdf_text(contents)
    default_kind = "retake" if RET.search(title) else "first" if FIRST.search(title) else "exam"
    return get_term(text) or get_term(title), exam_rows(text, final_url, default_kind)


def tum_exams():
    contents, _, base = fetch_public(TUM_EXAMS_URL, tum_only=True)
    document = SourceHTML()
    document.feed(contents.decode("utf-8", errors="replace"))
    links = {}
    for url, title in document.links:
        target = urljoin(base, url)
        if (
            urlsplit(target).path.lower().endswith(".pdf")
            and "bachelor ei" in title.lower()
            and get_term(title)
            and re.search(r"GOP|Pflichtprüfungen|Abschlussklausuren|Wiederholungsprüfungen", title, re.I)
        ):
            links[target] = title
    if not links:
        raise SourceError("source_not_found")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        pending = [executor.submit(load_tum_document, url, title) for url, title in list(links.items())[:8]]
        results = [future.result() for future in pending]
    terms = {term for term, rows in results if term and rows}
    if len(terms) != 1:
        raise SourceError("source_not_found")
    return {"term": terms.pop(), "rows": [row for _, rows in results for row in rows]}


def tum_catalogue_rows(text):
    rows = {}
    current = None
    name_start = 0
    for line in text.splitlines():
        row = re.match(
            rf"^\s*({MODULE_CODE})\s{{2,}}(.+?)"
            r"\s{2,}(?:(?:W|S)S(?:\s*/\s*(?:W|S)S)?(?:\s*\(B\))?\s+)?"
            r"(\d{1,2}(?:[,.]\d{1,2})?)(?:\s{2,}|$)",
            line,
        )
        if row:
            code, name, credits = row.groups()
            code = re.sub(r"\s+", "", code)
            current = {"code": code, "name": re.sub(r"\s+", " ", name), "credits": float(credits.replace(",", "."))}
            name_start = row.start(2)
            rows[code] = current
            continue
        if current is not None and len(line) > name_start and not line[:name_start].strip() and not line[name_start].isspace():
            fragment = re.split(r"\s{2,}", line[name_start:], maxsplit=1)[0].strip()
            if fragment and not fragment.startswith(("Seite ", "Stand:")) and not re.match(r"^[(/0-9]", fragment):
                title = current["name"]
                if title.endswith("-") and fragment[0].islower() and not fragment.startswith(("und ", "oder ")):
                    current["name"] = title[:-1] + fragment
                else:
                    current["name"] += " " + fragment
                continue
        current = None
    return sorted(rows.values(), key=lambda course: (course["name"].casefold(), course["code"]))


def tum_catalogue():
    global _catalogue_cache
    with _catalogue_lock:
        now = time.monotonic()
        if _catalogue_cache and now - _catalogue_cache[0] < CATALOGUE_TTL:
            return _catalogue_cache[1]
        try:
            contents, _, base = fetch_public(TUM_EI_PROGRAMME_URL, tum_only=True)
            document = SourceHTML()
            document.feed(contents.decode("utf-8", errors="replace"))
            url = next((
                urljoin(base, href)
                for href, title in document.links
                if "modulliste bachelor" in title.casefold() and "20231" in title
                and urlsplit(href).path.lower().endswith(".pdf")
            ), None)
            if not url:
                raise SourceError("source_not_found")
            contents, _, source = fetch_public(url, tum_only=True)
            courses = tum_catalogue_rows(pdf_text(contents))
            if not courses:
                raise SourceError("source_not_found")
            data = {"source": source, "courses": courses}
        except SourceError:
            if _catalogue_cache:
                return _catalogue_cache[1]
            raise
        _catalogue_cache = (now, data)
        return data


def programme_preview(text):
    name = ""
    required = None
    rows = []
    group = ""
    target = ""
    for line in text.splitlines():
        if not name and re.search(r"Bachelor|Master|Studiengang", line, re.I) and 8 < len(line) <= 180:
            name = line.strip()
        credit = CREDITS.search(line)
        code = CODE.search(line)
        if credit and re.search(r"gesamt|studienumfang|abschluss|total|erforderlich", line, re.I):
            required = required or credit[1]
        if code:
            tail = line[code.end():].strip()
            explicit = CREDITS.search(tail)
            tabular = re.search(r"\s{2,}(?:WS|SS|SoSe|WiSe|B)\s+(\d{1,3}(?:[,.]\d{1,2})?)\b", tail, re.I)
            course_credit = explicit or tabular
            if course_credit:
                course = tail[:course_credit.start()].strip(" –:-")
                if course:
                    rows.append({"group": group, "target": target, "name": course, "credits": course_credit[1], "code": code[0]})
        elif credit and re.search(r"\b(Pflicht\w*|Wahl\w*|Schwerpunkt\w*|Modulgruppe|module group|electives)\b", line, re.I):
            group = line[:credit.start()].strip(" –:-(")[:180] or group
            target = credit[1]
            if group:
                rows.append({"group": group, "target": target, "name": "", "credits": "", "code": ""})
    return {"name": name, "requiredCredits": required, "rows": rows[:250], "text": text}


def parse_source(data):
    mode = data.get("mode")
    if mode not in ("programme", "exams"):
        raise SourceError("source_unreadable")
    payload = data.get("pdf")
    url = data.get("url")
    if isinstance(payload, str) and payload:
        if len(payload) > ((MAX_BYTES + 2) // 3) * 4:
            raise SourceError("source_too_large")
        try:
            contents = base64.b64decode(payload, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise SourceError("source_unreadable") from exc
        if len(contents) > MAX_BYTES:
            raise SourceError("source_too_large")
        text = pdf_text(contents)
        source = str(data.get("name") or "PDF")[:180]
    elif isinstance(url, str) and url:
        contents, content_type, source = fetch_public(url)
        if contents.startswith(b"%PDF-"):
            text = pdf_text(contents)
        elif content_type == "text/html" and mode == "programme":
            document = SourceHTML()
            document.feed(contents.decode("utf-8", errors="replace"))
            text = document.text()[:MAX_TEXT]
        elif content_type == "text/plain" and mode == "programme":
            text = contents.decode("utf-8", errors="replace")[:MAX_TEXT]
        else:
            raise SourceError("source_unreadable")
    elif mode == "exams":
        return tum_exams()
    else:
        raise SourceError("source_unreadable")
    if not text.strip():
        raise SourceError("source_unreadable")
    if mode == "exams":
        return {"term": get_term(text), "rows": exam_rows(text, source)}
    return programme_preview(text)
